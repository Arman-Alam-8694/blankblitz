/**
 * Curated, family-friendly words used for auto-selection (timer expiry, bots).
 * Each word carries its category so auto-picked words still get a clue.
 * Words here are also accepted by validation (e.g. country / city names).
 */
import type { Category } from '@blankblitz/shared';

export const COMMON_WORDS: Record<Category, string[]> = {
  Animal: [
    'bear', 'deer', 'duck', 'frog', 'goat', 'lion', 'wolf', 'crab', 'swan', 'seal',
    'tiger', 'zebra', 'horse', 'sheep', 'mouse', 'eagle', 'shark', 'whale', 'camel', 'otter', 'koala', 'panda', 'snake',
    'rabbit', 'monkey', 'donkey', 'parrot', 'turtle', 'beaver', 'badger', 'jaguar', 'falcon', 'lizard',
    'giraffe', 'dolphin', 'penguin', 'leopard', 'hamster', 'buffalo', 'cheetah', 'gorilla', 'peacock',
    'elephant', 'kangaroo', 'flamingo', 'squirrel', 'antelope', 'hedgehog', 'scorpion', 'mosquito',
  ],
  Body: [
    'hand', 'knee', 'nose', 'neck', 'foot', 'shin', 'chin', 'palm',
    'elbow', 'mouth', 'heart', 'thumb', 'ankle', 'brain', 'tooth', 'liver', 'spine',
    'finger', 'eyebrow', 'shoulder', 'stomach', 'forehead', 'kidney', 'muscle', 'throat', 'tongue',
  ],
  City: [
    'rome', 'oslo', 'lima', 'doha', 'riga',
    'paris', 'tokyo', 'delhi', 'cairo', 'dubai', 'milan', 'seoul', 'dhaka', 'miami',
    'london', 'berlin', 'madrid', 'sydney', 'mumbai', 'moscow', 'vienna', 'prague', 'boston', 'lisbon',
    'chicago', 'beijing', 'toronto', 'karachi', 'bangkok', 'nairobi', 'jakarta', 'chennai', 'houston',
    'istanbul', 'shanghai', 'brussels', 'helsinki', 'santiago', 'montreal', 'portland',
  ],
  Clothing: [
    'coat', 'sock', 'shoe', 'belt', 'hood', 'cape', 'vest', 'robe',
    'scarf', 'shirt', 'skirt', 'jeans', 'glove', 'dress', 'boots', 'jacket',
    'hoodie', 'sandal', 'blazer', 'poncho', 'beanie', 'apron', 'sweater', 'trousers', 'pajamas', 'slipper', 'overalls',
  ],
  Color: [
    'blue', 'pink', 'gold', 'gray', 'teal', 'navy', 'ruby',
    'green', 'black', 'white', 'brown', 'coral', 'ivory', 'amber', 'lilac', 'beige',
    'purple', 'orange', 'yellow', 'silver', 'maroon', 'violet', 'indigo', 'crimson', 'scarlet', 'magenta', 'lavender', 'burgundy',
  ],
  Country: [
    'peru', 'iran', 'iraq', 'cuba', 'chad', 'mali', 'fiji', 'oman', 'laos',
    'india', 'china', 'japan', 'italy', 'spain', 'egypt', 'kenya', 'ghana', 'chile', 'nepal', 'qatar', 'yemen',
    'brazil', 'canada', 'mexico', 'france', 'norway', 'sweden', 'turkey', 'greece', 'poland', 'israel', 'russia', 'jordan',
    'germany', 'ireland', 'nigeria', 'vietnam', 'morocco', 'finland', 'denmark', 'iceland', 'austria', 'bhutan',
    'portugal', 'thailand', 'pakistan', 'malaysia', 'colombia', 'ethiopia', 'scotland', 'zimbabwe',
  ],
  Food: [
    'rice', 'soup', 'cake', 'meat', 'milk', 'taco', 'corn', 'bean', 'tofu', 'naan',
    'bread', 'pasta', 'pizza', 'sushi', 'honey', 'curry', 'toast', 'salad', 'bagel', 'donut', 'candy', 'steak',
    'cheese', 'butter', 'burger', 'noodle', 'cookie', 'muffin', 'waffle', 'omelet', 'pretzel', 'popcorn', 'biscuit',
    'pancake', 'lasagna', 'burrito', 'sausage', 'sandwich', 'meatball', 'pudding', 'brownie',
  ],
  Fruit: [
    'pear', 'plum', 'lime', 'kiwi', 'date', 'fig',
    'apple', 'mango', 'grape', 'lemon', 'peach', 'melon', 'guava', 'olive', 'berry',
    'banana', 'cherry', 'orange', 'papaya', 'raisin', 'lychee', 'quince', 'apricot', 'coconut', 'avocado',
    'durian', 'pumpkin', 'kumquat', 'mulberry', 'plantain', 'rhubarb',
  ],
  Home: [
    'sofa', 'lamp', 'door', 'roof', 'sink', 'oven', 'desk', 'wall', 'room', 'yard',
    'chair', 'table', 'couch', 'shelf', 'stove', 'towel', 'pillow', 'carpet', 'mirror', 'closet', 'garage',
    'kitchen', 'bedroom', 'cabinet', 'curtain', 'blanket', 'balcony', 'hallway', 'chimney',
    'bathroom', 'doorbell', 'mattress', 'wardrobe', 'bookcase',
  ],
  Job: [
    'chef', 'cook', 'poet', 'monk', 'maid', 'pilot', 'nurse', 'baker', 'judge', 'coach', 'actor', 'guard', 'tutor',
    'doctor', 'farmer', 'dancer', 'lawyer', 'barber', 'singer', 'waiter', 'banker', 'sailor', 'artist', 'dentist',
    'teacher', 'plumber', 'painter', 'butcher', 'surgeon', 'soldier', 'cashier', 'chemist',
    'engineer', 'designer', 'mechanic', 'novelist', 'musician', 'reporter',
  ],
  Music: [
    'drum', 'harp', 'song', 'band', 'jazz', 'rock', 'tune', 'bass', 'beat', 'lute',
    'piano', 'flute', 'cello', 'banjo', 'opera', 'tempo', 'chord', 'choir', 'disco', 'blues',
    'guitar', 'violin', 'trumpet', 'melody', 'rhythm', 'concert', 'trombone', 'clarinet', 'symphony', 'ukulele', 'bagpipe',
  ],
  Nature: [
    'tree', 'lake', 'rain', 'snow', 'wind', 'leaf', 'moss', 'rock', 'cave', 'hill', 'wave', 'sand',
    'river', 'ocean', 'cloud', 'storm', 'beach', 'grass', 'stone', 'coral', 'swamp', 'cliff',
    'forest', 'desert', 'meadow', 'canyon', 'jungle', 'island', 'valley', 'flower', 'breeze',
    'volcano', 'glacier', 'rainbow', 'thunder', 'tornado', 'mountain', 'lagoon', 'blizzard', 'sunshine',
  ],
  Object: [
    'book', 'cup', 'pen', 'key', 'ring', 'bell', 'coin', 'kite', 'rope', 'vase', 'fork', 'comb', 'bowl',
    'clock', 'brush', 'spoon', 'knife', 'candle', 'wallet', 'pencil', 'bottle', 'basket', 'hammer', 'ladder', 'magnet',
    'compass', 'lantern', 'teapot', 'balloon', 'battery', 'trophy', 'umbrella', 'envelope', 'backpack', 'notebook',
  ],
  Science: [
    'atom', 'cell', 'gene', 'mass', 'heat', 'acid', 'lens',
    'laser', 'orbit', 'comet', 'force', 'magma', 'quark', 'virus', 'fossil', 'planet', 'carbon', 'oxygen', 'energy',
    'neutron', 'protein', 'gravity', 'element', 'nucleus', 'molecule', 'electron', 'hydrogen', 'asteroid', 'bacteria',
  ],
  Sport: [
    'golf', 'polo', 'judo', 'swim', 'surf', 'yoga', 'race', 'dive', 'goal',
    'rugby', 'chess', 'boxing', 'skiing', 'karate', 'tennis', 'soccer', 'hockey', 'squash', 'diving', 'rowing', 'fencing',
    'cricket', 'cycling', 'archery', 'bowling', 'sailing', 'netball', 'baseball', 'football', 'swimming', 'handball', 'marathon',
  ],
  Tech: [
    'code', 'chip', 'disk', 'byte', 'wifi', 'data', 'link', 'icon', 'font',
    'robot', 'email', 'pixel', 'modem', 'cable', 'drone', 'phone', 'emoji', 'tablet', 'server', 'router',
    'laptop', 'camera', 'screen', 'gadget', 'browser', 'website', 'monitor', 'printer', 'speaker', 'charger',
    'keyboard', 'computer', 'software', 'internet', 'database', 'password',
  ],
  Vehicle: [
    'bike', 'boat', 'ship', 'tram', 'taxi', 'jeep', 'kart', 'raft', 'sled',
    'truck', 'train', 'canoe', 'yacht', 'ferry', 'plane', 'wagon', 'kayak',
    'subway', 'rocket', 'tanker', 'scooter', 'bicycle', 'tractor', 'minivan', 'trolley', 'airplane', 'sailboat',
    'zeppelin', 'monorail', 'carriage',
  ],
};
