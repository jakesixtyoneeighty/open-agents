/**
 * GitHub omits the email for users with a private address when the token
 * cannot read /user/emails (for example a GitHub App without the "Email
 * addresses" permission). Better Auth rejects sign-in without an email, so
 * fall back to the user's GitHub noreply address, which is unique per account.
 */
export function resolveGitHubEmail(profile: {
  id: number | string;
  login: string;
  email?: string | null;
}): string {
  if (profile.email) {
    return profile.email;
  }
  return `${profile.id}+${profile.login}@users.noreply.github.com`;
}
