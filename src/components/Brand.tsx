import { Wand2 } from 'lucide-react';

/** WallpaperWizard logo + name, for dark backgrounds (sidebar, login/setup header). */
export default function Brand({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const lg = size === 'lg';
  return (
    <div className={`flex items-center gap-2.5 ${lg ? 'justify-center' : ''}`}>
      <div className={`${lg ? 'w-10 h-10' : 'w-8 h-8'} rounded-lg ww-logo flex items-center justify-center shadow-lg`}>
        <Wand2 className={`${lg ? 'w-5 h-5' : 'w-4 h-4'} text-white`} aria-hidden="true" />
      </div>
      <div className="text-left">
        <div className={`text-white font-display font-bold tracking-tight leading-none ${lg ? 'text-2xl' : 'text-lg'}`}>WallpaperWizard</div>
        <div className="text-white/60 text-[10px] mt-1 font-semibold uppercase tracking-widest leading-none">Device wallpaper management</div>
      </div>
    </div>
  );
}
