/** JSON body for auth endpoints; refresh token is only sent via httpOnly cookie. */
export interface AuthTokensDto {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    role: string;
  };
}