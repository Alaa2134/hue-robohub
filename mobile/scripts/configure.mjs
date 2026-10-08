#!/usr/bin/env node
/**
 * Store settings for the native project (mobile/app), applied on top of what `npx cap add` generates.
 * Safe to run again: every change checks whether it is already there.
 *
 *   Android: camera permission (attendance scanner, photos), no cloud backup of sign-ins,
 *            version and release signing from the environment (see .github/workflows/mobile.yml).
 *   iOS:     camera / photo descriptions, no export-compliance prompt, iPhone only, portrait.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const mobile = path.resolve(import.meta.dirname, "..");
const edit = (file, fn) => {
  const before = readFileSync(file, "utf8");
  const after = fn(before);
  if (after !== before) writeFileSync(file, after);
};
const must = (s, find) => {
  if (!s.includes(find)) throw new Error(`configure: "${find.slice(0, 60)}" not found`);
  return s;
};

const CAMERA = "Scan attendance barcodes and event tickets, and take photos for your profile. تُستخدم الكاميرا لمسح باركود الحضور والتذاكر وتصوير صورك.";
const PHOTOS = "Choose photos for your profile, projects and posts. لاختيار صور لملفك ومشاريعك ومنشوراتك.";
const PHOTOS_ADD = "Save exported files and certificates to your photos. لحفظ الملفات والشهادات في الصور.";

{
  const dir = path.join(mobile, "app");

  // ── Android ──
  edit(path.join(dir, "android/app/src/main/AndroidManifest.xml"), (s) => {
    if (!s.includes("android.permission.CAMERA"))
      s = must(s, '<uses-permission android:name="android.permission.INTERNET" />').replace(
        '<uses-permission android:name="android.permission.INTERNET" />',
        '<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.CAMERA" />\n    <uses-feature android:name="android.hardware.camera" android:required="false" />',
      );
    // The app opens buildxhue.com/app/… links (check-in QR, quiz links); see build-static.mjs step 9.
    if (!s.includes('android:host="buildxhue.com"'))
      s = must(s, "            </intent-filter>\n").replace(
        "            </intent-filter>\n",
        `            </intent-filter>

            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="buildxhue.com" android:pathPrefix="/app" />
            </intent-filter>
`,
      );
    return s.replace('android:allowBackup="true"', 'android:allowBackup="false"');
  });
  edit(path.join(dir, "android/app/build.gradle"), (s) => {
    s = s.replace(/versionCode \d+/, 'versionCode((System.getenv("VERSION_CODE") ?: "1") as Integer)').replace(/versionName "[^"]*"/, 'versionName(System.getenv("VERSION_NAME") ?: "1.0.0")');
    if (!s.includes("signingConfigs"))
      s = must(s, "    buildTypes {\n        release {\n").replace(
        "    buildTypes {\n        release {\n",
        `    // Release signing comes from CI secrets; without them the release build is unsigned.
    signingConfigs {
        release {
            if (System.getenv("ANDROID_KEYSTORE_FILE")) {
                storeFile file(System.getenv("ANDROID_KEYSTORE_FILE"))
                storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("ANDROID_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_KEY_PASSWORD") ?: System.getenv("ANDROID_KEYSTORE_PASSWORD")
            }
        }
    }
    buildTypes {
        release {
            if (System.getenv("ANDROID_KEYSTORE_FILE")) signingConfig signingConfigs.release
`,
      );
    return s;
  });

  // ── iOS ──
  edit(path.join(dir, "ios/App/App/Info.plist"), (s) => {
    const add = (key, value) => {
      if (s.includes(`<key>${key}</key>`)) return;
      s = s.replace(/<\/dict>\s*<\/plist>\s*$/, `\t<key>${key}</key>\n\t${value}\n</dict>\n</plist>\n`);
    };
    add("NSCameraUsageDescription", `<string>${CAMERA}</string>`);
    add("NSPhotoLibraryUsageDescription", `<string>${PHOTOS}</string>`);
    add("NSPhotoLibraryAddUsageDescription", `<string>${PHOTOS_ADD}</string>`);
    add("ITSAppUsesNonExemptEncryption", "<false/>");
    add("NSFaceIDUsageDescription", "<string>Unlock the app with Face ID. لفتح التطبيق بـ Face ID.</string>");
    // The app is dark: light status bar text, and dark system sheets (pickers, share).
    add("UIStatusBarStyle", "<string>UIStatusBarStyleLightContent</string>");
    add("UIUserInterfaceStyle", "<string>Dark</string>");
    s = s.replace(/(<key>UIViewControllerBasedStatusBarAppearance<\/key>\s*)<true\/>/, "$1<false/>");
    s = s.replace(/(<key>CFBundleDevelopmentRegion<\/key>\s*<string>)en(<\/string>)/, "$1ar$2");
    s = s.replace(/(<key>UIRequiredDeviceCapabilities<\/key>\s*<array>\s*<string>)armv7(<\/string>)/, "$1arm64$2");
    s = s.replace(/(<key>UISupportedInterfaceOrientations<\/key>\s*<array>)[\s\S]*?(<\/array>)/, "$1\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t$2");
    return s;
  });
  // Push notifications: hand the APNs device token to Capacitor (the push plugin needs this in AppDelegate).
  edit(path.join(dir, "ios/App/App/AppDelegate.swift"), (s) => {
    if (s.includes("capacitorDidRegisterForRemoteNotifications")) return s;
    const at = s.lastIndexOf("}");
    return `${s.slice(0, at)}
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
}
`;
  });
  edit(path.join(dir, "ios/App/App.xcodeproj/project.pbxproj"), (s) =>
    s.replace(/TARGETED_DEVICE_FAMILY = "1,2";/g, "TARGETED_DEVICE_FAMILY = 1;").replace(/MARKETING_VERSION = 1\.0;/g, "MARKETING_VERSION = 1.0.0;"),
  );
  console.log("[configure] app ✓");
}
