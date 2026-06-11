import { useCallback, type ImgHTMLAttributes } from "react";
import {
  buildImageProxyUrl,
  displayImageUrl,
  isProxiedImageUrl,
} from "@/lib/imageProxy";

type ProxiedImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  runtimeBase: string | null | undefined;
  src: string;
};

export function ProxiedImage({
  runtimeBase,
  src,
  onError,
  ...rest
}: ProxiedImageProps) {
  const displaySrc = displayImageUrl(runtimeBase, src);

  const handleError = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      const img = event.currentTarget;
      const original = src.trim();
      if (
        runtimeBase &&
        original &&
        !isProxiedImageUrl(img.src)
      ) {
        img.src = buildImageProxyUrl(runtimeBase, original);
        return;
      }
      onError?.(event);
    },
    [onError, runtimeBase, src],
  );

  return <img {...rest} src={displaySrc} onError={handleError} />;
}
