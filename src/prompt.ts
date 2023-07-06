import { createInterface } from "readline";
const io = createInterface(process.stdin, process.stdout);

export function ask(question: string) {
  return new Promise<string>((resolve) => io.question(question, resolve));
}
