import type { VideoNodeStyle } from '@/types/canvas';
import { Camera, Clapperboard, PenLine, Sparkles, Wand2 } from 'lucide-react';

interface NodeIconProps {
  className: string;
  name: VideoNodeStyle['icon'];
}

/** 节点图标(lucide 图标按名称分发) */
export function NodeIcon({ className, name }: NodeIconProps) {
  switch (name) {
    case 'Camera':
      return <Camera className={className} />;
    case 'Clapperboard':
      return <Clapperboard className={className} />;
    case 'PenLine':
      return <PenLine className={className} />;
    case 'Sparkles':
      return <Sparkles className={className} />;
    case 'Wand2':
      return <Wand2 className={className} />;
  }
}