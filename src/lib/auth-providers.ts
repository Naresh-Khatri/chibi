// public flags mirror server-side provider enablement -> never render a dead button.
// set alongside the matching *_CLIENT_ID / *_CLIENT_SECRET in env.
export const socialAuthEnabled = {
  github: process.env.NEXT_PUBLIC_AUTH_GITHUB === "true",
  google: process.env.NEXT_PUBLIC_AUTH_GOOGLE === "true",
} as const;

export const anySocialAuthEnabled =
  socialAuthEnabled.github || socialAuthEnabled.google;
