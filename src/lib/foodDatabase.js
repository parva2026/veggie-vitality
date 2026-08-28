/**
 * Offline fallback food database (vegetarian focus). Values are per 100g.
 *
 * UNITS (these are enforced consistently across goals, this database, the
 * Gemini prompts, and the remedy table):
 *   calories kcal | protein/carbs/fat/fiber/sugar/eaa g | sodium/iron/calcium mg
 *   b12 mcg | vit_d IU | vit_a mcg RAE | vit_c mg | vit_e mg | vit_k mcg | folate mcg
 *
 * NOTE ON VITAMIN A: the original database stored vitamin A in IU (spinach
 * 9377, carrots 16706) while the daily goal and the LLM prompt both used
 * mcg RAE (900). Logging 100g of spinach therefore reported ~1000% of the
 * vitamin A target and made the micronutrient panel meaningless. All vitamin A
 * values below are now mcg RAE (USDA FoodData Central), matching the goal.
 *
 * `eaa_factor` is the fraction of a food's protein that is essential amino
 * acids — a proxy for protein quality, higher for dairy/soy than for grains.
 */
export const FOOD_DATABASE = {
  lentils: {
    cooked: { calories: 116, protein: 9, carbs: 20, fat: 0.4, fiber: 7.9, sugar: 1.8, sodium: 2, iron: 3.3, calcium: 19, b12: 0, vit_d: 0, vit_a: 0, vit_c: 1.5, vit_e: 0.1, vit_k: 1.7, folate: 181, eaa_factor: 0.39 },
    raw: { calories: 353, protein: 25, carbs: 60, fat: 1.1, fiber: 30, sugar: 2, sodium: 6, iron: 7.5, calcium: 35, b12: 0, vit_d: 0, vit_a: 2, vit_c: 4.4, vit_e: 0.5, vit_k: 5, folate: 479, eaa_factor: 0.39 },
  },
  rice: {
    cooked: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4, sugar: 0.1, sodium: 1, iron: 0.2, calcium: 10, b12: 0, vit_d: 0, vit_a: 0, vit_c: 0, vit_e: 0, vit_k: 0, folate: 58, eaa_factor: 0.37 },
    raw: { calories: 365, protein: 7, carbs: 80, fat: 0.7, fiber: 1.3, sugar: 0.1, sodium: 5, iron: 0.8, calcium: 28, b12: 0, vit_d: 0, vit_a: 0, vit_c: 0, vit_e: 0, vit_k: 0, folate: 20, eaa_factor: 0.37 },
  },
  spinach: {
    cooked: { calories: 23, protein: 3, carbs: 3.8, fat: 0.3, fiber: 2.2, sugar: 0.4, sodium: 24, iron: 3.6, calcium: 136, b12: 0, vit_d: 0, vit_a: 524, vit_c: 9.8, vit_e: 2.0, vit_k: 493, folate: 146, eaa_factor: 0.35 },
    raw: { calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2, sugar: 0.4, sodium: 79, iron: 2.7, calcium: 99, b12: 0, vit_d: 0, vit_a: 469, vit_c: 28, vit_e: 2.0, vit_k: 482, folate: 194, eaa_factor: 0.35 },
  },
  paneer: {
    raw: { calories: 265, protein: 18, carbs: 1.2, fat: 20.8, fiber: 0, sugar: 1.2, sodium: 20, iron: 0.1, calcium: 480, b12: 0.5, vit_d: 15, vit_a: 180, vit_c: 0, vit_e: 0.3, vit_k: 0, folate: 5, eaa_factor: 0.48 },
    cooked: { calories: 290, protein: 20, carbs: 1.5, fat: 22, fiber: 0, sugar: 1.5, sodium: 25, iron: 0.1, calcium: 480, b12: 0.5, vit_d: 15, vit_a: 180, vit_c: 0, vit_e: 0.3, vit_k: 0, folate: 5, eaa_factor: 0.48 },
  },
  chickpeas: {
    cooked: { calories: 164, protein: 8.9, carbs: 27, fat: 2.6, fiber: 7.6, sugar: 4.8, sodium: 7, iron: 2.9, calcium: 49, b12: 0, vit_d: 0, vit_a: 1, vit_c: 1.3, vit_e: 0.3, vit_k: 4, folate: 172, eaa_factor: 0.38 },
    raw: { calories: 378, protein: 20.5, carbs: 63, fat: 6, fiber: 12.2, sugar: 10.7, sodium: 24, iron: 4.3, calcium: 57, b12: 0, vit_d: 0, vit_a: 3, vit_c: 4, vit_e: 0.8, vit_k: 9, folate: 557, eaa_factor: 0.38 },
  },
  soy: {
    cooked: { calories: 173, protein: 16.6, carbs: 9.9, fat: 9, fiber: 6, sugar: 3, sodium: 1, iron: 5.1, calcium: 102, b12: 0, vit_d: 0, vit_a: 0, vit_c: 1.7, vit_e: 0.4, vit_k: 19.2, folate: 54, eaa_factor: 0.43 },
    raw: { calories: 446, protein: 36.5, carbs: 30, fat: 19.9, fiber: 9.3, sugar: 7.3, sodium: 2, iron: 15.7, calcium: 277, b12: 0, vit_d: 0, vit_a: 1, vit_c: 6, vit_e: 0.9, vit_k: 47, folate: 375, eaa_factor: 0.43 },
  },
  tofu: {
    cooked: { calories: 144, protein: 15.8, carbs: 4.3, fat: 8.7, fiber: 2.3, sugar: 0.6, sodium: 14, iron: 2.7, calcium: 683, b12: 0, vit_d: 0, vit_a: 0, vit_c: 0.2, vit_e: 0.1, vit_k: 2.4, folate: 19, eaa_factor: 0.45 },
    raw: { calories: 144, protein: 15.8, carbs: 4.3, fat: 8.7, fiber: 2.3, sugar: 0.6, sodium: 14, iron: 2.7, calcium: 683, b12: 0, vit_d: 0, vit_a: 0, vit_c: 0.2, vit_e: 0.1, vit_k: 2.4, folate: 19, eaa_factor: 0.45 },
  },
  yogurt: {
    raw: { calories: 61, protein: 3.5, carbs: 4.7, fat: 3.3, fiber: 0, sugar: 4.7, sodium: 46, iron: 0.1, calcium: 121, b12: 0.4, vit_d: 2, vit_a: 27, vit_c: 0.5, vit_e: 0.1, vit_k: 0.2, folate: 7, eaa_factor: 0.47 },
    cooked: { calories: 61, protein: 3.5, carbs: 4.7, fat: 3.3, fiber: 0, sugar: 4.7, sodium: 46, iron: 0.1, calcium: 121, b12: 0.4, vit_d: 2, vit_a: 27, vit_c: 0.5, vit_e: 0.1, vit_k: 0.2, folate: 7, eaa_factor: 0.47 },
  },
  milk: {
    raw: { calories: 61, protein: 3.2, carbs: 4.8, fat: 3.3, fiber: 0, sugar: 5.1, sodium: 43, iron: 0, calcium: 113, b12: 0.5, vit_d: 51, vit_a: 46, vit_c: 0, vit_e: 0.1, vit_k: 0.3, folate: 5, eaa_factor: 0.47 },
    cooked: { calories: 61, protein: 3.2, carbs: 4.8, fat: 3.3, fiber: 0, sugar: 5.1, sodium: 43, iron: 0, calcium: 113, b12: 0.5, vit_d: 51, vit_a: 46, vit_c: 0, vit_e: 0.1, vit_k: 0.3, folate: 5, eaa_factor: 0.47 },
  },
  roti: {
    cooked: { calories: 297, protein: 9.6, carbs: 56, fat: 4.2, fiber: 8.5, sugar: 1.5, sodium: 190, iron: 3.1, calcium: 45, b12: 0, vit_d: 0, vit_a: 0, vit_c: 0, vit_e: 0.5, vit_k: 1.2, folate: 30, eaa_factor: 0.36 },
  },
  potato: {
    cooked: { calories: 87, protein: 1.9, carbs: 20, fat: 0.1, fiber: 1.8, sugar: 0.9, sodium: 4, iron: 0.3, calcium: 8, b12: 0, vit_d: 0, vit_a: 0, vit_c: 13, vit_e: 0, vit_k: 2.1, folate: 10, eaa_factor: 0.35 },
    raw: { calories: 77, protein: 2, carbs: 17, fat: 0.1, fiber: 2.2, sugar: 0.8, sodium: 6, iron: 0.8, calcium: 12, b12: 0, vit_d: 0, vit_a: 0, vit_c: 19.7, vit_e: 0, vit_k: 2, folate: 15, eaa_factor: 0.35 },
  },
  banana: {
    raw: { calories: 89, protein: 1.1, carbs: 23, fat: 0.3, fiber: 2.6, sugar: 12, sodium: 1, iron: 0.3, calcium: 5, b12: 0, vit_d: 0, vit_a: 3, vit_c: 8.7, vit_e: 0.1, vit_k: 0.5, folate: 20, eaa_factor: 0.33 },
  },
  almonds: {
    raw: { calories: 579, protein: 21.2, carbs: 21.6, fat: 49.9, fiber: 12.5, sugar: 4.4, sodium: 1, iron: 3.7, calcium: 269, b12: 0, vit_d: 0, vit_a: 0, vit_c: 0, vit_e: 25.6, vit_k: 0, folate: 44, eaa_factor: 0.4 },
  },
  chips: {
    cooked: { calories: 536, protein: 7, carbs: 53, fat: 35, fiber: 4, sugar: 0.5, sodium: 600, iron: 1.6, calcium: 18, b12: 0, vit_d: 0, vit_a: 0, vit_c: 15, vit_e: 4, vit_k: 10, folate: 10, eaa_factor: 0.3 },
  },
  cola: {
    raw: { calories: 38, protein: 0, carbs: 10, fat: 0, fiber: 0, sugar: 10, sodium: 4, iron: 0, calcium: 2, b12: 0, vit_d: 0, vit_a: 0, vit_c: 0, vit_e: 0, vit_k: 0, folate: 0, eaa_factor: 0 },
  },
};

/** Alternate spellings/synonyms mapped onto database keys. */
export const FOOD_ALIASES = {
  dal: 'lentils', daal: 'lentils', dhal: 'lentils', lentil: 'lentils', masoor: 'lentils',
  chana: 'chickpeas', chickpea: 'chickpeas', garbanzo: 'chickpeas', rajma: 'chickpeas',
  chawal: 'rice', 'brown rice': 'rice', 'white rice': 'rice',
  palak: 'spinach',
  'soya chunks': 'soy', soya: 'soy', soybean: 'soy', soybeans: 'soy',
  curd: 'yogurt', dahi: 'yogurt', 'greek yogurt': 'yogurt', yoghurt: 'yogurt',
  chapati: 'roti', chapatti: 'roti', phulka: 'roti', 'whole wheat flour': 'roti',
  aloo: 'potato', potatoes: 'potato',
  almond: 'almonds', badam: 'almonds',
  'potato chips': 'chips', crisps: 'chips',
  coke: 'cola', pepsi: 'cola', 'soft drink': 'cola', soda: 'cola',
  paneer: 'paneer', 'cottage cheese': 'paneer',
};

/**
 * Foods suggested to close a nutrient gap. `density` is the nutrient amount
 * per 100g of the remedy food, in the same unit as the goal for that nutrient.
 */
export const REMEDIES = {
  vit_c: { food: 'Orange', density: 53.2, unit_name: 'medium orange', unit_weight: 130 },
  // 835 mcg RAE per 100g (was 16706, an IU value that did not match the goal).
  vit_a: { food: 'Carrots', density: 835, unit_name: 'medium carrot', unit_weight: 61 },
  vit_e: { food: 'Almonds', density: 25.6, unit_name: 'handful of almonds', unit_weight: 30 },
  iron: { food: 'Spinach', density: 3.6, unit_name: 'cup of spinach', unit_weight: 30 },
  calcium: { food: 'Paneer or tofu', density: 480, unit_name: 'serving of paneer', unit_weight: 100 },
  fiber: { food: 'Lentils', density: 7.9, unit_name: 'bowl of dal', unit_weight: 200 },
  protein: { food: 'Soya chunks', density: 36.5, unit_name: 'serving of soya', unit_weight: 50 },
  b12: { food: 'Yogurt', density: 0.4, unit_name: 'cup of curd', unit_weight: 245 },
  folate: { food: 'Lentils', density: 181, unit_name: 'bowl of dal', unit_weight: 200 },
  vit_d: { food: 'Fortified milk', density: 51, unit_name: 'glass of milk', unit_weight: 240 },
  eaa: { food: 'Paneer, tofu or soy', density: 7.6, unit_name: 'serving of paneer', unit_weight: 100 },
};
