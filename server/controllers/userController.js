import { successResponse, errorResponse } from "../utils/response.js";
import { sanitize } from "../utils/sanitizer.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  getCurrentUserService,
  getProfilePictureUploadUrlService,
  logoutService,
  logoutAllService,
  getAllUsersService,
  softDeleteUserService,
  hardDeleteUserService,
  recoverUserService,
  getPermissionPageService,
  updateUserRoleService,
  getUserFilesService,
  deleteUserFilesService,
  getUserFileViewService,
  updateUserFileService,
  getUserListService,
  updateUserProfileService,
} from "../services/user/userService.js";
import { CustomError } from "../utils/CustomError.js";
import User from "../models/userModel.js";

export const getCurrentUser = asyncHandler(async (req, res) => {
  const result = await getCurrentUserService(req.user._id);
  return successResponse(res, result);
});

export const getProfilePictureUploadUrl = asyncHandler(async (req, res) => {
  const { contentType, filename } = req.query;
  const result = await getProfilePictureUploadUrlService(req.user._id, contentType, filename);
  return successResponse(res, result);
});

export const logout = asyncHandler(async (req, res) => {
  const { sid } = req.signedCookies;
  await logoutService(sid);

  res.clearCookie("sid", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    signed: true,
  });
  res.status(204).end();
});

export const logoutAll = asyncHandler(async (req, res) => {
  await logoutAllService(req.user._id);
  res.clearCookie("sid");
  res.status(204).end();
});

export const logOutById = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  await logoutAllService(userId);
  res.status(204).end();
});

export const getUserPassword = asyncHandler(async (req, res) => {
  const dbUser = await User.findById(req.user._id).select("password");
  const hasPassword = !!(dbUser && dbUser.password && dbUser.password.length > 0);
  return successResponse(res, { hasPassword });
});

export const getAllUsers = asyncHandler(async (req, res) => {
  const result = await getAllUsersService(req.user.role);
  return successResponse(res, result);
});

export const softDeleteUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  await softDeleteUserService(userId, req.user._id);
  res.status(204).end();
});

export const hardDeleteUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  await hardDeleteUserService(userId, req.user._id, req.user.role);
  res.status(204).end();
});

export const recoverUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  await recoverUserService(userId, req.user._id);
  return successResponse(res, null, `User has been recovered with UID: ${userId}`);
});

export const permissionPage = asyncHandler(async (req, res) => {
  const result = await getPermissionPageService(req.user);
  return successResponse(res, result);
});

export const updateUserRole = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body;
  const result = await updateUserRoleService(userId, role, req.user.id, req.user.role);
  return successResponse(res, result, "Role updated successfully");
});

export const getUserFiles = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const result = await getUserFilesService(userId, req.user);
  return successResponse(res, result);
});

export const deleteUserFiles = asyncHandler(async (req, res) => {
  const { userId, fileId } = req.params;
  await deleteUserFilesService(userId, fileId, req.user);
  return successResponse(res, null, "File deleted successfully");
});

export const getUserFileView = asyncHandler(async (req, res) => {
  const { userId, fileId } = req.params;
  const result = await getUserFileViewService(userId, fileId, req.user, req.query.action, req.query.format);
  
  if (result.type === "json") {
    return successResponse(res, { url: result.url });
  }
  return res.redirect(result.url);
});

export const updateUserFile = asyncHandler(async (req, res) => {
  const { userId, fileId } = req.params;
  const { name } = req.body;
  await updateUserFileService(userId, fileId, name);
  return successResponse(res, null, "File renamed successfully");
});

export const getUserList = asyncHandler(async (req, res) => {
  const result = await getUserListService();
  return successResponse(res, result);
});

export const updateUserProfile = asyncHandler(async (req, res) => {
  const { name, picture } = sanitize(req.body);
  const result = await updateUserProfileService(req.user._id, name, picture);
  return successResponse(res, result, "Profile updated successfully");
});