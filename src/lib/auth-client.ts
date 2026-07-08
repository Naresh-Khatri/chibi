import { createAuthClient } from "better-auth/react";

// baseURL defaults to current origin -> fine for single-app
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
