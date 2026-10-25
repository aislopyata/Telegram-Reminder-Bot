export class TelegramApiError extends Error {
  constructor(
    message: string,
    public readonly options: {
      /** HTTP status from Telegram, or undefined for network failures. */
      status?: number;
      retryAfterSeconds?: number;
      permanent: boolean;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "TelegramApiError";
  }
}
