import { LoadingManager, type WebGLRenderer } from "three";
import { MeshoptDecoder } from "meshoptimizer";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import type { EventBus } from "../core/EventBus";
import type { GameEvents } from "../core/GameEvents";

export interface AssetLoaderOptions {
  readonly dracoDecoderPath?: string;
  readonly ktx2TranscoderPath?: string;
  readonly decoderWorkerLimit?: number;
}

/** Loads GLB assets with Draco, Meshopt, and KTX2 support and URL-based caching. */
export class AssetLoader {
  private readonly renderer: WebGLRenderer;
  private readonly events: EventBus<GameEvents>;
  private readonly dracoDecoderPath: string;
  private readonly ktx2TranscoderPath: string;
  private readonly decoderWorkerLimit: number;
  private readonly gltfCache = new Map<string, Promise<GLTF>>();
  private destroyed = false;

  public constructor(
    renderer: WebGLRenderer,
    events: EventBus<GameEvents>,
    options: AssetLoaderOptions = {},
  ) {
    this.renderer = renderer;
    this.events = events;
    this.dracoDecoderPath = options.dracoDecoderPath ?? "./draco/";
    this.ktx2TranscoderPath = options.ktx2TranscoderPath ?? "./basis/";
    this.decoderWorkerLimit = options.decoderWorkerLimit ?? 1;

    if (!Number.isSafeInteger(this.decoderWorkerLimit) || this.decoderWorkerLimit < 1) {
      throw new RangeError("AssetLoader decoderWorkerLimit must be a positive integer.");
    }
  }

  public loadGLTF(url: string): Promise<GLTF> {
    if (this.destroyed) {
      return Promise.reject(new Error("AssetLoader has been destroyed."));
    }

    const cachedAsset = this.gltfCache.get(url);

    if (cachedAsset !== undefined) {
      return cachedAsset;
    }

    const loadingAsset = this.loadUncachedGLTF(url);
    this.gltfCache.set(url, loadingAsset);

    void loadingAsset.catch(() => {
      this.gltfCache.delete(url);
    });

    return loadingAsset;
  }

  public clearCache(): void {
    this.gltfCache.clear();
  }

  public destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.clearCache();
  }

  private async loadUncachedGLTF(url: string): Promise<GLTF> {
    const manager = new LoadingManager();
    manager.onProgress = (loadedUrl, loaded, total) => {
      this.events.emit("asset:progress", { url: loadedUrl, loaded, total });
    };

    const dracoLoader = new DRACOLoader(manager)
      .setDecoderPath(this.dracoDecoderPath)
      .setWorkerLimit(this.decoderWorkerLimit);
    const ktx2Loader = new KTX2Loader(manager)
      .setTranscoderPath(this.ktx2TranscoderPath)
      .detectSupport(this.renderer)
      .setWorkerLimit(this.decoderWorkerLimit);
    const gltfLoader = new GLTFLoader(manager)
      .setDRACOLoader(dracoLoader)
      .setKTX2Loader(ktx2Loader)
      .setMeshoptDecoder(MeshoptDecoder);

    try {
      const gltf = await gltfLoader.loadAsync(url);
      this.events.emit("asset:loaded", { url });
      return gltf;
    } catch (error: unknown) {
      this.events.emit("asset:failed", {
        url,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      dracoLoader.dispose();
      ktx2Loader.dispose();
    }
  }
}
