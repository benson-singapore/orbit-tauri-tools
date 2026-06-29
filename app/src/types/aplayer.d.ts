declare module "aplayer" {
  export interface APlayerAudioItem {
    name: string;
    artist?: string;
    url: string;
    cover?: string;
    lrc?: string;
    theme?: string;
    type?: "auto" | "hls" | "normal" | string;
  }

  export interface APlayerOptions {
    container: HTMLElement;
    fixed?: boolean;
    mini?: boolean;
    autoplay?: boolean;
    theme?: string;
    loop?: "all" | "one" | "none";
    order?: "list" | "random";
    preload?: "none" | "metadata" | "auto";
    volume?: number;
    audio?: APlayerAudioItem | APlayerAudioItem[];
    mutex?: boolean;
    lrcType?: number;
    listFolded?: boolean;
    listMaxHeight?: number;
    storageName?: string;
    customAudioType?: Record<string, (audioElement: HTMLAudioElement, audio: APlayerAudioItem, player: APlayer) => void>;
  }

  export type ChannelPlaybackMode = "order" | "loop-all" | "loop-one" | "shuffle";

  export interface APlayerList {
    audios: APlayerAudioItem[];
    index: number;
    add(audios: APlayerAudioItem | APlayerAudioItem[]): void;
    remove(index: number): void;
    switch(index: number): void;
    clear(): void;
    show(): void;
    hide(): void;
    toggle(): void;
  }

  export default class APlayer {
    constructor(options: APlayerOptions);
    audio: HTMLAudioElement;
    list: APlayerList;
    options: APlayerOptions;
    index?: number;
    randomOrder?: number[];
    play(): void;
    pause(): void;
    seek(time: number): void;
    toggle(): void;
    skipBack(): void;
    skipForward(): void;
    destroy(): void;
    on(event: string, handler: (...args: unknown[]) => void): void;
  }
}

declare module "aplayer/dist/APlayer.min.css";
