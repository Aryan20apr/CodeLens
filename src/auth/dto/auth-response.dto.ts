export interface AuthTokensDto {
    accessToken: string;
    refreshToken: string;
    user: {
      id: string;
      email: string;
      name: string | null;
      avatarUrl: string | null;
      role: string;
    };
  }