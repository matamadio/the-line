// Builds the Android TV app (android/) into dist-android/the-line.apk, with the Android
// SDK's own tools and no Gradle: there is one Java file and no libraries.
//
//   node tools/android.mjs            build
//   node tools/android.mjs install    build, then install on the device adb is connected to
//
// Needs a JDK (javac, keytool, jar) and the Android SDK, from ANDROID_HOME or its usual
// place, with platforms;android-34, build-tools;34.0.0 and platform-tools. It is signed with
// the standard debug key (~/.android/debug.keystore), made if missing: fine for sideloading.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const PLATFORM = 'android-34', BUILD_TOOLS = '34.0.0', MIN_SDK = '21';
const win = process.platform === 'win32';
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
  || (win ? join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk') : join(homedir(), 'Android', 'Sdk'));
const tools = join(sdk, 'build-tools', BUILD_TOOLS);
const androidJar = join(sdk, 'platforms', PLATFORM, 'android.jar');
const exe = (dir, name, bat = false) => join(dir, win ? `${name}.${bat ? 'bat' : 'exe'}` : name);
const adb = exe(join(sdk, 'platform-tools'), 'adb');

for (const [what, path] of [['the Android platform', androidJar], ['the build tools', tools], ['adb', adb]]) {
  if (!existsSync(path)) {
    console.error(`Missing ${what} (${path}). Install with:\n  sdkmanager "platforms;${PLATFORM}" "build-tools;${BUILD_TOOLS}" "platform-tools"`);
    process.exit(1);
  }
}

const root = resolve(import.meta.dirname, '..'), src = join(root, 'android'), out = join(root, 'dist-android'), tmp = join(out, 'build');
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', shell: win && cmd.endsWith('.bat') });
const version = JSON.parse((await import('node:fs')).readFileSync(join(root, 'package.json'), 'utf8')).version;
// Each build installs over the last: the version code only has to go up, so it is the minute of the build.
const versionCode = String(Math.floor(Date.now() / 60000) - 29_000_000);

rmSync(out, { recursive: true, force: true });
mkdirSync(join(tmp, 'classes'), { recursive: true });

// Resources and the manifest.
run(exe(tools, 'aapt2'), ['compile', '--dir', join(src, 'res'), '-o', join(tmp, 'res.zip')]);
run(exe(tools, 'aapt2'), ['link', '-I', androidJar, '--manifest', join(src, 'AndroidManifest.xml'), '-o', join(tmp, 'app.apk'),
  join(tmp, 'res.zip'), '--min-sdk-version', MIN_SDK, '--target-sdk-version', PLATFORM.split('-')[1],
  '--version-code', versionCode, '--version-name', version]);

// The code.
const java = [];
const walk = (dir) => { for (const f of readdirSync(dir, { withFileTypes: true })) f.isDirectory() ? walk(join(dir, f.name)) : f.name.endsWith('.java') && java.push(join(dir, f.name)); };
walk(join(src, 'src'));
run('javac', ['--release', '11', '-classpath', androidJar, '-d', join(tmp, 'classes'), ...java]);
const classes = [];
const walkC = (dir) => { for (const f of readdirSync(dir, { withFileTypes: true })) f.isDirectory() ? walkC(join(dir, f.name)) : f.name.endsWith('.class') && classes.push(join(dir, f.name)); };
walkC(join(tmp, 'classes'));
run(exe(tools, 'd8', true), ['--release', '--lib', androidJar, '--min-api', MIN_SDK, '--output', tmp, ...classes]);
run('jar', ['--update', '--no-manifest', '--file', join(tmp, 'app.apk'), '-C', tmp, 'classes.dex']);

// Aligned and signed.
run(exe(tools, 'zipalign'), ['-f', '-p', '4', join(tmp, 'app.apk'), join(tmp, 'aligned.apk')]);
const keystore = join(homedir(), '.android', 'debug.keystore');
if (!existsSync(keystore)) {
  mkdirSync(join(homedir(), '.android'), { recursive: true });
  run('keytool', ['-genkeypair', '-keystore', keystore, '-storepass', 'android', '-alias', 'androiddebugkey', '-keypass', 'android',
    '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000', '-dname', 'CN=Android Debug,O=Android,C=US']);
}
const apk = join(out, 'the-line.apk');
run(exe(tools, 'apksigner', true), ['sign', '--ks', keystore, '--ks-pass', 'pass:android', '--key-pass', 'pass:android', '--out', apk, join(tmp, 'aligned.apk')]);
rmSync(tmp, { recursive: true, force: true });
console.log(`Built ${apk} (version ${version}, code ${versionCode})`);

if (process.argv[2] === 'install') run(adb, ['install', '-r', apk]);
