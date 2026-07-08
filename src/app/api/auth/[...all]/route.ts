import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// catch-all: sign in/up, sessions, oauth callbacks
export const { GET, POST } = toNextJsHandler(auth);
