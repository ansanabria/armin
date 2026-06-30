import { pathToFileURL } from "node:url";
import { net, protocol } from "electron";
import { mediaPath, mimeForMediaFile } from "./services/media";
import { MEDIA_PROTOCOL, isSafeMediaFileName } from "../shared/media-ref";

export function registerMediaProtocolScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_PROTOCOL,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
      },
    },
  ]);
}

export function registerMediaProtocol() {
  protocol.handle(MEDIA_PROTOCOL, async (request) => {
    const url = new URL(request.url);
    const profileId = decodeURIComponent(url.hostname);
    const fileName = url.pathname.replace(/^\//, "");
    if (!isSafeMediaFileName(fileName)) {
      return new Response("Not found", { status: 404 });
    }
    const mime = mimeForMediaFile(fileName);
    if (!profileId || !mime) {
      return new Response("Not found", { status: 404 });
    }
    try {
      const fileUrl = pathToFileURL(mediaPath(profileId, fileName)).toString();
      const response = await net.fetch(fileUrl);
      return new Response(response.body, {
        status: response.status,
        headers: { "content-type": mime },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}
