export interface StdinReader {
  readAll(): Promise<string>;
}
