// Startet den Expo-Server fürs iPhone mit einem Expo-Zugangstoken (statt Login mit Passwort).
// Der Token wird verdeckt abgefragt und nur an den Expo-Prozess weitergegeben, nicht gespeichert.
// Aufruf im Projektordner: node scripts/start-iphone.mjs [port]
import { spawn } from 'node:child_process';
import readline from 'node:readline';

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Nur die Frage ausgeben, die getippten Zeichen nicht
    rl._writeToOutput = (text) => {
      if (text.includes(question)) rl.output.write(text);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

const token = process.env.EXPO_TOKEN || (await askHidden('Expo-Token einfügen und Enter drücken (wird nicht angezeigt): '));
if (!token) {
  console.error('Kein Token eingegeben.');
  process.exit(1);
}

const port = process.argv[2] ?? '8083';
const child = spawn(process.execPath, ['node_modules/expo/bin/cli', 'start', '--port', port], {
  stdio: 'inherit',
  env: { ...process.env, EXPO_TOKEN: token },
});
child.on('exit', (code) => process.exit(code ?? 0));
