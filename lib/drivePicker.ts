/* Google's file picker for choosing Docs, Sheets and other Drive files.
   Needs three public settings (see the README): the OAuth client id, an API
   key with the Picker API enabled, and the Google Cloud project number. The
   picker asks for the drive.file permission, which only covers the files the
   person picks. */

export const PICKER_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
export const PICKER_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? "";
export const PICKER_APP_ID = process.env.NEXT_PUBLIC_GOOGLE_APP_ID ?? "";

export const pickerAvailable = Boolean(PICKER_CLIENT_ID && PICKER_API_KEY && PICKER_APP_ID);

export type PickedFile = { url: string; name: string; mimeType: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
type G = any;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Google's file picker."));
    document.head.appendChild(s);
  });
}

let token: { value: string; expires: number } | null = null;

async function accessToken(): Promise<string> {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  await loadScript("https://accounts.google.com/gsi/client");
  const google = (window as G).google;
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: PICKER_CLIENT_ID,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: (res: G) => {
        if (res.error || !res.access_token) {
          reject(new Error("Google did not allow access."));
          return;
        }
        token = { value: res.access_token, expires: Date.now() + Number(res.expires_in ?? 3600) * 1000 };
        resolve(res.access_token);
      },
      error_callback: () => reject(new Error("The Google sign-in window was closed.")),
    });
    client.requestAccessToken({ prompt: token ? "" : "consent" });
  });
}

export async function pickDriveFiles(kind: "doc" | "sheet"): Promise<PickedFile[]> {
  const [access] = await Promise.all([
    accessToken(),
    loadScript("https://apis.google.com/js/api.js"),
  ]);
  const gapi = (window as G).gapi;
  await new Promise<void>((resolve) => gapi.load("picker", { callback: () => resolve() }));
  const google = (window as G).google;
  const P = google.picker;

  return new Promise((resolve) => {
    const main = new P.DocsView(kind === "doc" ? P.ViewId.DOCUMENTS : P.ViewId.SPREADSHEETS)
      .setIncludeFolders(true)
      .setOwnedByMe(false);
    const all = new P.DocsView(P.ViewId.DOCS).setIncludeFolders(true);
    const picker = new P.PickerBuilder()
      .setAppId(PICKER_APP_ID)
      .setDeveloperKey(PICKER_API_KEY)
      .setOAuthToken(access)
      .addView(main)
      .addView(all)
      .enableFeature(P.Feature.MULTISELECT_ENABLED)
      .setTitle(kind === "doc" ? "Choose Google Docs" : "Choose Google Sheets")
      .setCallback((data: G) => {
        const action = data[P.Response.ACTION];
        if (action === P.Action.PICKED) {
          const docs = (data[P.Response.DOCUMENTS] ?? []) as G[];
          resolve(
            docs.map((d) => ({
              url: String(d[P.Document.URL] ?? ""),
              name: String(d[P.Document.NAME] ?? ""),
              mimeType: String(d[P.Document.MIME_TYPE] ?? ""),
            }))
          );
        } else if (action === P.Action.CANCEL) {
          resolve([]);
        }
      })
      .build();
    picker.setVisible(true);
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */
