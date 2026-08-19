import { cn } from '@/lib/utils';
import * as React from 'react';

export interface SliderProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  showValue?: boolean;
  unit?: string;
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, value, onChange, min = 0, max = 100, step = 1, showValue = true, unit = '', ...props }, ref) => {
    const percentage = ((value - min) / (max - min)) * 100;

    return (
      <div className="flex items-center gap-3">
        <input
          ref={ref}
          type="range"
          className={cn(
            'h-2 w-[120px] cursor-pointer appearance-none rounded-full bg-muted',
            className
          )}
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            background: `linear-gradient(to right, var(--primary) ${percentage}%, var(--muted) ${percentage}%)`,
          }}
          {...props}
        />
        {showValue && (
          <span className="text-muted-foreground min-w-[48px] text-right text-sm">
            {value}{unit}
          </span>
        )}
      </div>
    );
  }
);
Slider.displayName = 'Slider';

export { Slider };
