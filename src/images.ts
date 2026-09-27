import { ResourceType } from './types';

export const RESOLVED_IMAGE_MAP: Record<string, string> = {};

export function getImageUrl(url: string): string {
  if (!url) return '';
  return RESOLVED_IMAGE_MAP[url] || url;
}

export function getImageCandidates(url: string): string[] {
  if (!url) return [];
  const match = url.match(/\/gh\/xia-skot\/Catan_Pics\/img\/(.+)$/);
  if (!match) return [`/api/proxy-image?url=${encodeURIComponent(url)}`, url];
  const filename = match[1];
  const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(`https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/${filename}`)}`;
  return [
    proxyUrl,
    `https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/${filename}`,
    `https://cdn.jsdelivr.net/gh/xia-skot/Catan_Pics/img/${filename}`,
    `https://gcore.jsdelivr.net/gh/xia-skot/Catan_Pics/img/${filename}`,
    `https://jsd.cdn.zzko.cn/gh/xia-skot/Catan_Pics/img/${filename}`,
    `https://testingcf.jsdelivr.net/gh/xia-skot/Catan_Pics/img/${filename}`,
    `https://raw.githubusercontent.com/xia-skot/Catan_Pics/main/img/${filename}`,
  ];
}

export const FOREST_IMG = 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/%E6%A3%AE%E6%9E%97.jpg';
export const FIELDS_IMG = 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/%E9%BA%A6%E7%94%B0.jpg';
export const PASTURE_IMG = 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/%E7%89%A7%E5%9C%BA.jpg';
export const Desert_IMG =  'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/%E6%B2%99%E6%BC%A0.jpg';
export const Mountains_IMG =  'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/%E7%9F%BF%E5%B1%B1.jpg';

// Resource Icons
export const LUMBER_ICON = 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/%E6%A0%91.png';
export const BRICK_ICON = 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/%E7%A0%96%E5%9D%97.png';
export const WOOL_ICON = 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/%E7%BE%8A2.png';
export const GRAIN_ICON = 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/%E5%B0%8F%E9%BA%A6.png';
export const ORE_ICON = 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/%E9%93%81%E7%9F%BF%E7%9F%B3.png';

export const RESOURCE_ICONS: Record<ResourceType, string> = {
  [ResourceType.Lumber]: LUMBER_ICON,
  [ResourceType.Brick]: BRICK_ICON,
  [ResourceType.Wool]: WOOL_ICON,
  [ResourceType.Grain]: GRAIN_ICON,
  [ResourceType.Ore]: ORE_ICON,
};

export const HILLS_IMG = 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/%E4%B8%98%E9%99%B5.jpg';
export const GOLD_IMG = 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/%E9%87%91%E7%9F%BF.jpg';
export const SEA_HEX_IMG = 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/%E6%B5%B7%E6%B4%8B.jpg';
export const ROBBER_IMG = 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/%E5%BC%BA%E7%9B%972.png';
export const FOOTPRINT_IMG = 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/%E8%84%9A%E5%8D%B0.png';
export const ANCHOR_IMG = 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/%E8%88%B9%E9%94%9A.png';
export const PIRATE_SHIP_IMG = 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/%E6%B5%B7%E7%9B%97%E8%88%B9.png';
export const SAILING_BOAT_IMG = 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/%E5%B8%86%E8%88%B9.png';
export const CATAN_LOGO_IMG = 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/catan_logo.png';
export const DEV_CARD_ICON = 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/%E5%8F%91%E5%B1%95%E5%8D%A1.png';
export const RES_CARD_ICON = 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/%E8%B5%84%E6%BA%90%E5%8D%A1.png';
export const ROAD_ICON = 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/%E9%81%93%E8%B7%AF.png';
export const MAP_ALBUM_ICON = 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/%E5%9C%B0%E5%9B%BE%E5%86%8C.png';

export const KNIGHT_DEV_IMG = 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/%E9%AA%91%E5%A3%AB.png';
export const VICTORY_POINT_DEV_IMG = 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/%E8%83%9C%E5%88%A9%E7%82%B9.png';
export const ROAD_BUILDING_DEV_IMG = 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/%E9%81%93%E8%B7%AF%E5%BB%BA%E8%AE%BE.png';
export const YEAR_OF_PLENTY_DEV_IMG = 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/%E4%B8%B0%E6%94%B6.png';
export const MONOPOLY_DEV_IMG = 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/img/%E5%9E%84%E6%96%AD.png';

export function getDevCardImg(type: string): string {
  switch (type) {
    case 'knight':
    case 'Knight':
      return KNIGHT_DEV_IMG;
    case 'victory_point':
    case 'VictoryPoint':
    case 'victoryPoint':
      return VICTORY_POINT_DEV_IMG;
    case 'road_building':
    case 'RoadBuilding':
    case 'roadBuilding':
      return ROAD_BUILDING_DEV_IMG;
    case 'year_of_plenty':
    case 'YearOfPlenty':
    case 'yearOfPlenty':
      return YEAR_OF_PLENTY_DEV_IMG;
    case 'monopoly':
    case 'Monopoly':
      return MONOPOLY_DEV_IMG;
    default:
      return DEV_CARD_ICON;
  }
}

export const ALL_GAME_IMAGES: string[] = [
  FOREST_IMG,
  FIELDS_IMG,
  PASTURE_IMG,
  Desert_IMG,
  Mountains_IMG,
  HILLS_IMG,
  GOLD_IMG,
  SEA_HEX_IMG,
  LUMBER_ICON,
  BRICK_ICON,
  WOOL_ICON,
  GRAIN_ICON,
  ORE_ICON,
  ROBBER_IMG,
  FOOTPRINT_IMG,
  ANCHOR_IMG,
  PIRATE_SHIP_IMG,
  SAILING_BOAT_IMG,
  CATAN_LOGO_IMG,
  DEV_CARD_ICON,
  RES_CARD_ICON,
  ROAD_ICON,
  MAP_ALBUM_ICON,
  KNIGHT_DEV_IMG,
  VICTORY_POINT_DEV_IMG,
  ROAD_BUILDING_DEV_IMG,
  YEAR_OF_PLENTY_DEV_IMG,
  MONOPOLY_DEV_IMG,
];

