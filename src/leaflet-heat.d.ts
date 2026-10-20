// Typen voor de leaflet.heat-plugin (die levert er zelf geen mee).
import 'leaflet';

declare module 'leaflet' {
  interface HeatLayerOptions {
    minOpacity?: number;
    maxZoom?: number;
    max?: number;
    radius?: number;
    blur?: number;
    gradient?: Record<number, string>;
  }
  interface HeatLayer extends Layer {
    setLatLngs(latlngs: Array<[number, number, number?]>): this;
    addLatLng(latlng: [number, number, number?]): this;
  }
  function heatLayer(latlngs: Array<[number, number, number?]>, options?: HeatLayerOptions): HeatLayer;
}

declare module 'leaflet.heat';
