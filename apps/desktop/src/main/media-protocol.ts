import { pathToFileURL } from "node:url";
import { net, protocol } from "electron";
import { mediaPath, mimeForMediaFile } from "./services/media";

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
    const requestUrl = new URL(request.url);
    const profileId = decodeURIComponent(requestUrl.hostname);
    const mediaFileName = requestUrl.pathname.replace(/^\//, "");
    const mime = mimeForMediaFile(mediaFileName);

    if (!profileId || !mime) {
      return new Response("Not found", { status: 404 });
    }

    try {
      const mediaFileUrl = pathToFileURL(
        mediaPath(profileId, mediaFileName),
      ).toString();
      const mediaResponse = await net.fetch(mediaFileUrl);
      return new Response(mediaResponse.body, {
        status: mediaResponse.status,
        headers: { "content-type": mime },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}
