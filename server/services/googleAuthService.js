import { OAuth2Client } from "google-auth-library";

const clientId = process.env.GOOGLE_LOGIN_CLIENT_ID;

const client = new OAuth2Client({
  clientId,
});

export async function verifyIdToken(idToken) {
  const loginTicket = await client.verifyIdToken({
    idToken,
    audience: clientId,
  });

  const userData = loginTicket.getPayload();
  return userData;
}
