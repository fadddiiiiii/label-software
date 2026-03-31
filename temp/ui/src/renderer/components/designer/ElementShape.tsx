import React, { useRef, useEffect, useState } from 'react';
import { Rect, Text, Line, Ellipse, Group, Image as KonvaImage, Transformer } from 'react-konva';
import { useDataStore } from '../../store/data';
import { LabelElement as LabelElementType } from '../../types/template';
import { renderBarcodeClientSide } from '../../hooks/useBarcodeRenderer';

export const MM_TO_PX = 96 / 25.4;

export function mmToPx(mm: number, zoom: number): number {
  return mm * MM_TO_PX * zoom;
}

export function pxToMm(px: number, zoom: number): number {
  return px / (MM_TO_PX * zoom);
}

function BarcodePlaceholder({ w, h }: { w: number; h: number }) {
  const barCount = 12;
  const barWidth = w / (barCount * 1.5);
  const bars: React.ReactNode[] = [];
  for (let i = 0; i < barCount; i++) {
    const bh = h * (0.6 + Math.random() * 0.4);
    bars.push(<Rect key={i} x={i * barWidth * 1.5} y={(h - bh) / 2} width={barWidth} height={bh} fill="#ddd" />);
  }
  return <Group>{bars}</Group>;
}

function QRCodePlaceholder({ w, h }: { w: number; h: number }) {
  const s = Math.min(w, h);
  const m = s * 0.08;
  const qrSize = s - m * 2;
  const modules = 21;
  const modSize = qrSize / modules;

  const finderPattern = (ox: number, oy: number) => {
    const nodes: React.ReactNode[] = [];
    nodes.push(<Rect key={`fo-${ox}-${oy}`} x={ox} y={oy} width={modSize * 7} height={modSize * 7} fill="#ddd" />);
    nodes.push(<Rect key={`fw-${ox}-${oy}`} x={ox + modSize} y={oy + modSize} width={modSize * 5} height={modSize * 5} fill="#fff" />);
    nodes.push(<Rect key={`fc-${ox}-${oy}`} x={ox + modSize * 2} y={oy + modSize * 2} width={modSize * 3} height={modSize * 3} fill="#ddd" />);
    return nodes;
  };

  const dataModules: React.ReactNode[] = [];
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if ((r < 8 && c < 8) || (r < 8 && c >= modules - 8) || (r >= modules - 8 && c < 8)) continue;
      const hash = ((r * 31 + c * 17 + 7) * 2654435761) >>> 0;
      if (hash % 3 !== 0) {
        dataModules.push(<Rect key={`d-${r}-${c}`} x={m + c * modSize} y={m + r * modSize} width={modSize * 0.9} height={modSize * 0.9} fill="#ddd" />);
      }
    }
  }

  return (
    <Group>
      {[...finderPattern(m, m), ...finderPattern(m + (modules - 7) * modSize, m), ...finderPattern(m, m + (modules - 7) * modSize)]}
      {dataModules}
    </Group>
  );
}

export interface ElementShapeProps {
  elem: LabelElementType;
  zoom: number;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
  onDragStart?: (id: string) => void;
  onDragEnd?: (id: string, x: number, y: number) => void;
  onDragMove?: (id: string, updates: Partial<LabelElementType>) => void;
  onTransformStart?: (id: string) => void;
  onTransformEnd?: (id: string, updates: Partial<LabelElementType>) => void;
  snapEnabled?: boolean;
  rowIndex?: number;
}

export function ElementShape({
  elem,
  zoom,
  isSelected,
  onSelect,
  onDragStart,
  onDragEnd,
  onDragMove,
  onTransformStart,
  onTransformEnd,
  snapEnabled,
  rowIndex,
}: ElementShapeProps) {
  const shapeRef = useRef<any>(null);
  const trRef = useRef<any>(null);
  const resolveBindingValue = useDataStore(s => s.resolveBindingValue);
  const currentPreviewRow = useDataStore(s => s.currentPreviewRow);
  const boundValue = resolveBindingValue(elem.id, rowIndex ?? currentPreviewRow);
  // Use the bound value if available, otherwise fall back to the element's own value
  const displayValue = boundValue || elem.value || '';

  const [barcodeImg, setBarcodeImg] = useState<HTMLImageElement | null>(null);
  const [barcodeStatus, setBarcodeStatus] = useState<'none' | 'loading' | 'success' | 'error'>('none');

  const w = mmToPx(elem.width_mm, zoom);
  const h = mmToPx(elem.height_mm, zoom);
  const x = mmToPx(elem.x_mm, zoom);
  const y = mmToPx(elem.y_mm, zoom);

  // Barcode loading
  useEffect(() => {
    let active = true;
    if (elem.type === 'barcode' || elem.type === 'qrcode') {
      const data = displayValue || (elem.type === 'qrcode' ? 'https://omg.com' : '12345678');
      const symbology = elem.symbology || (elem.type === 'qrcode' ? 'qrcode' : 'code128');

      setBarcodeStatus('loading');
      renderBarcodeClientSide(symbology, data, w, h).then(url => {
        if (!active) return;
        if (!url) {
          setBarcodeStatus('error');
          return;
        }
        const img = new window.Image();
        img.onload = () => {
          if (active) {
            setBarcodeImg(img);
            setBarcodeStatus('success');
          }
        };
        img.src = url;
      });
    }
    return () => { active = false; };
  }, [elem.type, elem.symbology, displayValue, w, h]);

  const [customImg, setCustomImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (elem.type !== 'image') return;
    let active = true;
    const src = displayValue && displayValue.startsWith('data:image') ? displayValue : (elem.image_b64 || null);
    if (src) {
      const img = new window.Image();
      img.onload = () => { if (active) setCustomImg(img); };
      img.src = src;
    }
    return () => { active = false; };
  }, [elem.type, elem.image_b64, displayValue]);

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  const handleDragEnd = (e: any) => {
    if (onDragEnd) {
      onDragEnd(elem.id, pxToMm(e.target.x(), zoom), pxToMm(e.target.y(), zoom));
    }
  };

  const commonProps = {
    ref: shapeRef,
    x,
    y,
    draggable: !!onDragEnd && !elem.locked,
    rotation: elem.rotation || 0,
    onClick: () => onSelect?.(elem.id),
    onTap: () => onSelect?.(elem.id),
    onDragStart: () => onDragStart?.(elem.id),
    onDragEnd: handleDragEnd,
    onDragMove: () => {
      if (!onDragMove || !shapeRef.current) return;
      const node = shapeRef.current;
      onDragMove(elem.id, {
        x_mm: Math.round(pxToMm(node.x(), zoom) * 100) / 100,
        y_mm: Math.round(pxToMm(node.y(), zoom) * 100) / 100,
      });
    },
    onTransform: () => {
      if (!onDragMove || !shapeRef.current) return;
      const node = shapeRef.current;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      onDragMove(elem.id, {
        x_mm: Math.round(pxToMm(node.x(), zoom) * 100) / 100,
        y_mm: Math.round(pxToMm(node.y(), zoom) * 100) / 100,
        width_mm: Math.round(pxToMm(node.width() * scaleX, zoom) * 100) / 100,
        height_mm: Math.round(pxToMm(node.height() * scaleY, zoom) * 100) / 100,
        rotation: Math.round(node.rotation() * 10) / 10,
      });
    },
    onTransformStart: () => onTransformStart?.(elem.id),
    onTransformEnd: () => {
      const node = shapeRef.current;
      if (!node || !onTransformEnd) return;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      node.scaleX(1);
      node.scaleY(1);
      onTransformEnd(elem.id, {
        x_mm: Math.round(pxToMm(node.x(), zoom) * 100) / 100,
        y_mm: Math.round(pxToMm(node.y(), zoom) * 100) / 100,
        width_mm: Math.round(pxToMm(node.width() * scaleX, zoom) * 100) / 100,
        height_mm: Math.round(pxToMm(node.height() * scaleY, zoom) * 100) / 100,
        rotation: Math.round(node.rotation() * 10) / 10,
      });
    }
  };

  let shape: React.ReactNode = null;
  const computedFontSize = elem.font_size * zoom;
  const isBold = Number(elem.font_weight) >= 600 || elem.font_weight === 'bold' || elem.text_font_bold;
  const isItalic = elem.font_italic || elem.text_font_italic;
  const fontStyle = isBold && isItalic ? 'bold italic' : isBold ? 'bold' : isItalic ? 'italic' : 'normal';
  const textDecoration = (elem.underline ? 'underline ' : '') + (elem.strikeout ? 'line-through' : '');

  switch (elem.type) {
    case 'text': {
      const textFill = elem.inverse ? (elem.background_color || '#FFFFFF') : elem.color;
      const textBg = elem.inverse ? elem.color : (elem.background_color !== 'transparent' ? elem.background_color : undefined);
      shape = (
        <Group {...commonProps} width={w} height={h}>
          {textBg && <Rect width={w} height={h} fill={textBg} />}
          <Text width={w} height={h} text={displayValue || ''}
            fontSize={computedFontSize} fontFamily={elem.font_name}
            fontStyle={fontStyle}
            fill={textFill} align={elem.justify ? 'justify' : elem.align}
            verticalAlign={elem.vertical_align || 'middle'}
            textDecoration={textDecoration.trim() || undefined}
            scaleX={elem.mirror ? -1 : 1}
            offsetX={elem.mirror ? w : 0}
          />
          {elem.border_enabled && <Rect width={w} height={h} stroke={elem.border_color} strokeWidth={elem.border_width * zoom} />}
        </Group>
      );
      break;
    }
    case 'barcode':
    case 'qrcode': {
      const showHumanText = elem.show_text && elem.type === 'barcode';
      const barcodeData = displayValue || (elem.type === 'qrcode' ? 'https://omg.com' : '12345678');
      const textFontSize = Math.max(6, (elem.text_font_size_mm || 2.5) * MM_TO_PX * zoom);
      const barH = showHumanText ? Math.max(h * 0.1, h - textFontSize - 2 * zoom) : h;
      const textH = h - barH;

      const humanTextNode = showHumanText ? (
        <Text text={barcodeData}
          fontSize={textFontSize}
          fontFamily={elem.text_font_name || 'Helvetica'}
          fontStyle={elem.text_font_bold ? (elem.text_font_italic ? 'bold italic' : 'bold') : (elem.text_font_italic ? 'italic' : 'normal')}
          fill={elem.color || '#000'} width={w} height={textFontSize}
          align={elem.text_anchor || 'center'} verticalAlign="middle"
        />
      ) : null;

      if (barcodeImg) {
        shape = (
          <Group {...commonProps} width={w} height={h}>
            <Rect width={w} height={h} fill="transparent" />
            <Group y={showHumanText && elem.text_on_top ? textH : 0}>
              <KonvaImage image={barcodeImg} width={w} height={barH} />
            </Group>
            {showHumanText && (
              <Group y={elem.text_on_top ? 0 : barH}>
                {React.cloneElement(humanTextNode!, { y: 0, height: textH })}
              </Group>
            )}
          </Group>
        );
      } else {
        shape = (
          <Group {...commonProps} width={w} height={h}>
            <Rect width={w} height={h} fill="transparent" stroke="#ddd" strokeWidth={1} />
            {elem.type === 'qrcode' ? <QRCodePlaceholder w={w} h={h} /> : <BarcodePlaceholder w={w} h={h} />}
          </Group>
        );
      }
      break;
    }
    case 'image':
      shape = (
        <Group {...commonProps} width={w} height={h}>
          {customImg ? <KonvaImage image={customImg} width={w} height={h} /> : <Rect width={w} height={h} fill="#f0f0f0" stroke="#ccc" />}
        </Group>
      );
      break;
    case 'rect':
      shape = (
        <Group {...commonProps} width={w} height={h}>
          <Rect width={w} height={h}
            stroke={elem.border_color} strokeWidth={elem.border_width * zoom}
            fill={elem.filled ? elem.fill_color : 'transparent'}
            cornerRadius={elem.corner_radius_mm > 0 ? mmToPx(elem.corner_radius_mm, zoom) : 0}
            dash={elem.line_style === 'dashed' ? [8, 4] : elem.line_style === 'dotted' ? [2, 2] : elem.line_style === 'dash-dot' ? [8, 4, 2, 4] : undefined} />
        </Group>
      );
      break;
    case 'circle':
      shape = (
        <Group {...commonProps} width={w} height={h}>
          <Ellipse
            x={w / 2} y={h / 2}
            radiusX={w / 2} radiusY={h / 2}
            stroke={elem.border_color} strokeWidth={elem.border_width * zoom}
            fill={elem.filled ? elem.fill_color : 'transparent'}
            dash={elem.line_style === 'dashed' ? [8, 4] : elem.line_style === 'dotted' ? [2, 2] : elem.line_style === 'dash-dot' ? [8, 4, 2, 4] : undefined} />
        </Group>
      );
      break;
    case 'line': {
      const dashMap: Record<string, number[] | undefined> = {
        solid: undefined, dashed: [8, 4], dotted: [2, 2], 'dash-dot': [8, 4, 2, 4],
      };
      shape = (
        <Line {...commonProps}
          points={[0, 0, w, 0]}
          stroke={elem.border_color} strokeWidth={elem.border_width * zoom}
          lineCap={elem.line_cap === 'round' ? 'round' : elem.line_cap === 'flat' ? 'butt' : 'square'}
          dash={dashMap[elem.line_style || 'solid']} />
      );
      break;
    }
  }

  if (elem.hidden) return null;

  return (
    <>
      {shape}
      {isSelected && (
        <Transformer ref={trRef}
          rotateEnabled={!elem.locked}
          keepRatio={elem.type === 'qrcode' || elem.type === 'circle' || (elem.type === 'image' && elem.maintain_aspect_ratio)}
          enabledAnchors={elem.type === 'line' ? ['middle-left', 'middle-right'] : undefined}
          borderStroke="#1a1a1a" borderStrokeWidth={1.5}
          anchorStroke="#1a1a1a" anchorFill="#ffffff" anchorSize={8}
          anchorCornerRadius={2} />
      )}
    </>
  );
}
