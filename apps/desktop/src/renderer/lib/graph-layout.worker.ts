import {
  computeGraphLayoutResponse,
  type GraphLayoutWorkerRequest,
} from "@/lib/graph-layout-worker";

self.onmessage = (event: MessageEvent<GraphLayoutWorkerRequest>) => {
  self.postMessage(computeGraphLayoutResponse(event.data));
};
