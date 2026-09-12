import { describe, expect, it } from "vitest";
import { cameraConstraints, mediaErrorMessage } from "../src/sources/frames";

describe("cameraConstraints", () => {
  it("prefers the rear camera when no device is chosen", () => {
    const video = cameraConstraints().video as MediaTrackConstraints;
    expect(video.facingMode).toEqual({ ideal: "environment" });
    expect(video.deviceId).toBeUndefined();
    expect(video.width).toEqual({ ideal: 1920 });
  });

  it("pins an explicit device id", () => {
    const video = cameraConstraints("cam-12").video as MediaTrackConstraints;
    expect(video.deviceId).toEqual({ exact: "cam-12" });
    expect(video.facingMode).toBeUndefined();
  });
});

describe("mediaErrorMessage", () => {
  it("maps permission and missing-device errors", () => {
    expect(mediaErrorMessage(new DOMException("denied", "NotAllowedError"))).toBe(
      "Permission denied.",
    );
    expect(mediaErrorMessage(new DOMException("gone", "NotFoundError"))).toBe("No camera found.");
  });
});
