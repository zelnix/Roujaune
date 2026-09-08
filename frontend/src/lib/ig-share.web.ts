export type IgMode = "feed" | "story";
export type IgResult = "shared" | "notinstalled" | "error";

// Web has no native Instagram/Facebook hand-off; callers fall back to their web path.
export async function shareToInstagram(_mode: IgMode, _imageUri: string, _appId: string): Promise<IgResult> {
  return "error";
}
export async function shareToFacebook(_imageUri: string): Promise<IgResult> {
  return "error";
}
