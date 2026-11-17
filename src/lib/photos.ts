// Royalty-free stock photos served by picsum.photos (Unsplash licence).
// Hand-picked for "expressive" subjects: animals, people, awkward moments.
const IDS: number[] = [
  40, 64, 91, 129, 133, 169, 200, 219, 237, 244, 325, 338, 342, 395, 433, 453, 454,
  513, 582, 593, 611, 628, 659, 660, 669, 680, 718, 783, 790, 823, 832, 837, 838,
  841, 856, 996, 1001, 1003, 1005, 1008, 1010, 1011, 1012, 1013, 1020, 1024, 1025,
  1027, 1062, 1074, 1084,
];

export const picsum = (id: number) => `https://picsum.photos/id/${id}/800/600`;
export const STOCK_PHOTOS: string[] = IDS.map(picsum);
