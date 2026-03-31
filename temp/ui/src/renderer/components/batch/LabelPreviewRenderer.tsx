import React, { useMemo } from 'react';
import { Stage, Layer } from 'react-konva';
import { ElementShape, MM_TO_PX } from '../designer/ElementShape';
import { useCanvasStoreCompat } from '../../store/canvas';

interface LabelPreviewRendererProps {
  widthMm: number;
  heightMm: number;
  ratio: number;
  rowIndex: number;
  backgroundColor?: string;
  borderRadius?: number | string;
}

export function LabelPreviewRenderer({
  widthMm,
  heightMm,
  ratio,
  rowIndex,
  backgroundColor = '#ffffff',
  borderRadius = 0,
}: LabelPreviewRendererProps) {
  const { elements } = useCanvasStoreCompat();

  const stageW = widthMm * ratio;
  const stageH = heightMm * ratio;

  // Use a smaller zoom for the preview based on the ratio
  // The ratio in PrintPreview is (pixels per mm at current zoom)
  // Our mmToPx uses 96/25.4 * zoom.
  // So ratio = 96/25.4 * zoom_factor.
  const internalZoom = ratio / MM_TO_PX;

  return (
    <div style={{ 
      width: stageW, 
      height: stageH, 
      background: backgroundColor, 
      borderRadius: borderRadius,
      overflow: 'hidden',
      border: '1px solid #bbb',
      flexShrink: 0,
    }}>
      <Stage width={stageW} height={stageH}>
        <Layer>
          {[...elements]
            .sort((a, b) => a.z_index - b.z_index)
            .map(elem => (
              <ElementShape 
                key={elem.id} 
                elem={elem} 
                zoom={internalZoom} 
                rowIndex={rowIndex} 
                isSelected={false}
              />
            ))}
        </Layer>
      </Stage>
    </div>
  );
}
