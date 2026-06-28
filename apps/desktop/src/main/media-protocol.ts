import { pathToFileURL } from "node:url";
import { net, protocol } from "electron";
import { mediaPath } from "./services/media";
import { mimeForMediaFile } from "./services/media";

export const MEDIA_PROTOCOL = "armin-media";

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
