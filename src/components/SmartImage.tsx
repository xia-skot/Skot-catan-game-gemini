import React from 'react';
import { useGameImage } from '../imageManager';

export function SmartImage({ src = '', alt = '', style, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const { image } = useGameImage(src);
  return <img {...props} src={image?.src} alt={alt} style={{ ...style, visibility: image ? style?.visibility : 'hidden' }} />;
}
