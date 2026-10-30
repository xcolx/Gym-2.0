import { userApi, type ImageUpload } from "@/lib/api";
import { updateStoredUser } from "./user";

// MARK: - Account (online, then stored locally)

/** ProfileImageRow.upload: uploads the cropped image and stores the hashes on the current user */
export async function uploadProfileImage(userId: number, image: ImageUpload): Promise<void> {
  const result = await userApi.updateProfileImage(image);
  if (result.imageUrl && result.iconUrl) {
    await updateStoredUser(userId, { profileImageUrl: result.imageUrl, profileIconUrl: result.iconUrl });
  }
}

/** Removes the profile image and clears the hashes on the current user */
export async function removeProfileImage(userId: number): Promise<void> {
  await userApi.deleteProfileImage();
  await updateStoredUser(userId, { profileImageUrl: "", profileIconUrl: "" });
}

/** ChangeUsernameView.save. Fails with 400 if the username is taken, 429 if changed less than a minute ago. */
export async function changeUsername(userId: number, username: string): Promise<void> {
  await userApi.changeUsername(username);
  await updateStoredUser(userId, { username });
}
