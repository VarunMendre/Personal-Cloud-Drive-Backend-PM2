import Directory from "../../models/directoryModel.js";
import File from "../../models/fileModel.js";
import { deletes3Files } from "../s3.js";
import { updateDirectorySize } from "../../utils/updateDirectorySize.js";
import { CustomError } from "../../utils/CustomError.js";

// BOLT OPTIMIZATION: Replaced recursive O(N) database queries with a single O(1) query.
// Since every subdirectory under dirId has dirId in its path property, we can find all nested
// subdirectories and files in parallel using flat queries, saving many roundtrips and avoiding loading large numbers of documents.
async function getRecursiveCounts(dirId) {
  // Find all nested directory IDs under dirId using the path field
  const nestedDirs = await Directory.find({ path: dirId }).select("_id").lean();
  const nestedDirIds = nestedDirs.map((d) => d._id);

  // Count files in this directory and all its subdirectories in a single optimized DB call
  const totalFiles = await File.countDocuments({
    parentDirId: { $in: [dirId, ...nestedDirIds] },
  });

  const totalFolders = nestedDirs.length;

  return { totalFiles, totalFolders };
}

export const getDirectoryService = async (id, userId) => {
  const directoryData = await Directory.findOne({
    _id: id,
    userId: userId,
  })
    .populate("path", "name")
    .lean();

  if (!directoryData) {
    throw new CustomError(
      "Directory not found or you do not have access to it!",
      404,
    );
  }

  const files = await File.find({ parentDirId: directoryData._id }).lean();
  const directories = await Directory.find({ parentDirId: id }).lean();

  // Get recursive counts for this directory
  const { totalFiles, totalFolders } = await getRecursiveCounts(
    directoryData._id,
  );

  return {
    ...directoryData,
    files: files.map((dir) => ({ ...dir, id: dir._id })),
    directories: directories.map((dir) => ({ ...dir, id: dir._id })),
    totalFiles,
    totalFolders,
  };
};

export const createDirectoryService = async (dirname, parentDirId, userId) => {
  // Ensures user can only create folders inside their own folders
  const parentDir = await Directory.findOne({
    _id: parentDirId,
    userId: userId,
  }).lean();

  if (!parentDir) {
    throw new CustomError("Parent Directory Does not exist!", 404);
  }

  const newPath = [...(parentDir.path || []), parentDir._id];

  await Directory.create({
    name: dirname,
    parentDirId,
    userId: userId,
    path: newPath,
  });
};

export const renameDirectoryService = async (dirId, newDirName, userId) => {
  const result = await Directory.findOneAndUpdate(
    {
      _id: dirId,
      userId: userId,
    },
    { name: newDirName },
  );

  if (!result) {
    throw new CustomError(
      "Directory not found or not authorized to rename",
      404,
    );
  }
};

// BOLT OPTIMIZATION: Replaced recursive getDirectoryContents with flat queries.
// It retrieves all subdirectories at any depth using the path index, and then fetches
// all related file details in a single query rather than walking the folder tree asynchronously.
async function getDirectoryContents(id) {
  // Find all nested directory IDs under the target directory
  const directories = await Directory.find({ path: id }).select("_id").lean();
  const nestedDirIds = directories.map((d) => d._id);

  // Get all files belonging to the parent directory or any of the subdirectories
  const files = await File.find({
    parentDirId: { $in: [id, ...nestedDirIds] },
  })
    .select("extension")
    .lean();

  return { files, directories };
}

export const deleteDirectoryService = async (dirId, userId) => {
  const directoryData = await Directory.findOne({
    _id: dirId,
    userId: userId,
  }).lean();

  if (!directoryData) {
    throw new CustomError("Directory not found!", 404);
  }

  const { files, directories } = await getDirectoryContents(dirId);

  const keys = files.map(({ _id, extension }) => ({
    Key: `${_id}${extension}`,
  }));

  if (keys.length > 0) {
    await deletes3Files(keys);
  }

  if (files.length > 0) {
    await File.deleteMany({
      _id: { $in: files.map(({ _id }) => _id) },
    });
  }

  await Directory.deleteMany({
    _id: { $in: [...directories.map(({ _id }) => _id), dirId] },
  });

  await updateDirectorySize(directoryData.parentDirId, -directoryData.size);
};
