/**
 * Harder auto-pick tiers. "Easy" is COMMON_WORDS (everyday words). These lists step up to
 * less common (medium) and rare / tricky-letter (hard) words — still real and family-friendly.
 * Hand-curated on purpose: no third-party frequency list, no offensive words.
 */
import type { Category } from '@blankblitz/shared';

export const MEDIUM_WORDS: Record<Category, string[]> = {
  Animal: [
    'moose', 'bison', 'hyena', 'llama', 'lemur', 'raven', 'heron', 'squid', 'trout', 'viper', 'gecko', 'sloth',
    'walrus', 'ferret', 'iguana', 'toucan', 'weasel', 'magpie', 'salmon', 'pigeon', 'oyster', 'lobster',
    'octopus', 'panther', 'raccoon', 'vulture', 'buzzard', 'pelican', 'ostrich', 'mongoose', 'reindeer', 'stingray',
  ],
  Body: [
    'wrist', 'skull', 'lungs', 'ribs', 'hips', 'heel', 'lips', 'gums', 'nerve', 'veins', 'scalp', 'torso',
    'eyelid', 'pupil', 'temple', 'tendon', 'nostril', 'eyelash', 'kneecap', 'earlobe', 'knuckle', 'skeleton',
  ],
  City: [
    'kyoto', 'lagos', 'porto', 'quito', 'hanoi', 'basel', 'turin', 'osaka',
    'munich', 'dublin', 'zurich', 'warsaw', 'athens', 'manila', 'nagpur', 'lahore', 'havana', 'denver', 'geneva',
    'seattle', 'atlanta', 'phoenix', 'kolkata', 'caracas', 'glasgow', 'sapporo', 'jaipur',
    'florence', 'auckland', 'budapest', 'hamburg', 'edinburgh',
  ],
  Clothing: [
    'tunic', 'shawl', 'sari', 'kilt', 'toga', 'beret', 'clogs', 'mitten', 'bikini', 'corset', 'parka',
    'turban', 'sarong', 'cardigan', 'bandana', 'leggings', 'kimono', 'raincoat', 'pullover', 'tuxedo',
  ],
  Color: [
    'cyan', 'jade', 'plum', 'rust', 'sand', 'khaki', 'olive', 'peach', 'mauve', 'cream', 'azure', 'ochre',
    'salmon', 'bronze', 'copper', 'cobalt', 'emerald', 'saffron', 'charcoal', 'turquoise',
  ],
  Country: [
    'togo', 'niger', 'gabon', 'benin', 'samoa', 'tonga', 'malta', 'nauru', 'palau', 'sudan', 'libya', 'syria',
    'angola', 'belize', 'brunei', 'cyprus', 'guyana', 'kuwait', 'latvia', 'malawi', 'panama', 'serbia', 'rwanda', 'uganda',
    'albania', 'armenia', 'bahrain', 'bolivia', 'croatia', 'ecuador', 'jamaica', 'lebanon', 'senegal', 'somalia', 'tunisia',
  ],
  Food: [
    'chili', 'crepe', 'gravy', 'jelly', 'kebab', 'mochi', 'nacho', 'pesto', 'ramen', 'scone', 'syrup', 'tapas',
    'falafel', 'granola', 'hummus', 'risotto', 'paella', 'samosa', 'strudel', 'custard', 'dumpling', 'porridge', 'flapjack',
  ],
  Fruit: [
    'lychee', 'damson', 'medlar', 'pomelo', 'feijoa', 'loquat', 'currant', 'satsuma', 'tangelo', 'nectarine',
    'cranberry', 'tamarind', 'mandarin', 'kiwano', 'jackfruit', 'gooseberry', 'pineapple', 'grapefruit',
  ].filter((w) => w.length <= 8),
  Home: [
    'attic', 'porch', 'patio', 'drawer', 'faucet', 'hammock', 'cellar', 'pantry', 'skylight', 'doormat',
    'stairs', 'banister', 'radiator', 'fireplace', 'staircase', 'dresser', 'ottoman', 'cushion', 'lampshade',
  ].filter((w) => w.length <= 8),
  Job: [
    'clerk', 'medic', 'usher', 'jockey', 'cobbler', 'janitor', 'florist', 'jeweler', 'courier', 'curator',
    'gardener', 'tailor', 'sculptor', 'pharmacist', 'locksmith', 'optician', 'botanist', 'surveyor', 'magician', 'firefighter',
  ].filter((w) => w.length <= 8),
  Music: [
    'oboe', 'sitar', 'tabla', 'organ', 'tenor', 'lyric', 'remix', 'encore', 'treble', 'sonata', 'ballad', 'anthem',
    'bassoon', 'cymbal', 'maracas', 'quartet', 'orchestra', 'accordion', 'harmonica', 'mandolin', 'xylophone',
  ].filter((w) => w.length <= 8),
  Nature: [
    'brook', 'marsh', 'creek', 'dune', 'reef', 'tide', 'fern', 'pebble', 'ravine', 'tundra', 'savanna', 'prairie',
    'iceberg', 'monsoon', 'cyclone', 'drizzle', 'estuary', 'geyser', 'plateau', 'waterfall', 'boulder', 'avalanche',
  ].filter((w) => w.length <= 8),
  Object: [
    'anvil', 'easel', 'funnel', 'goblet', 'kettle', 'locket', 'padlock', 'pliers', 'saucer', 'stapler', 'thimble',
    'tweezers', 'whistle', 'hourglass', 'scissors', 'trowel', 'shovel', 'flashlight', 'telescope', 'compass',
  ].filter((w) => w.length <= 8),
  Science: [
    'ozone', 'prism', 'nebula', 'photon', 'proton', 'plasma', 'enzyme', 'genome', 'isotope', 'fission', 'fusion',
    'catalyst', 'friction', 'velocity', 'momentum', 'spectrum', 'organism', 'mineral', 'neuron',
  ],
  Sport: [
    'darts', 'sumo', 'luge', 'canoe', 'kendo', 'skating', 'curling', 'lacrosse', 'biathlon', 'softball', 'pingpong',
    'rafting', 'climbing', 'snooker', 'billiards', 'javelin', 'hurdles', 'triathlon', 'wrestling',
  ].filter((w) => w.length <= 8),
  Tech: [
    'cloud', 'cookie', 'cursor', 'widget', 'pixel', 'kernel', 'backup', 'upload', 'bluetooth', 'firewall', 'hardware',
    'malware', 'firmware', 'headset', 'joystick', 'touchpad', 'webcam', 'hotspot', 'podcast', 'download',
  ].filter((w) => w.length <= 8),
  Vehicle: [
    'barge', 'blimp', 'buggy', 'coach', 'gondola', 'sleigh', 'tandem', 'trailer', 'chariot', 'dinghy', 'glider',
    'hovercraft', 'limousine', 'catamaran', 'motorbike', 'skateboard', 'ambulance', 'steamer', 'unicycle',
  ].filter((w) => w.length <= 8),
};

export const HARD_WORDS: Record<Category, string[]> = {
  Animal: [
    'ibex', 'kudu', 'gnu', 'yak', 'okapi', 'tapir', 'quail', 'zebu', 'dingo', 'nyala', 'quokka', 'jackal',
    'ocelot', 'marmot', 'axolotl', 'wombat', 'narwhal', 'pangolin', 'aardvark', 'platypus', 'wildebeest', 'jerboa', 'oryx',
  ].filter((w) => w.length >= 4 && w.length <= 8),
  Body: [
    'femur', 'tibia', 'ulna', 'pelvis', 'larynx', 'thorax', 'sternum', 'cornea', 'retina', 'sinus', 'cuticle',
    'clavicle', 'pancreas', 'appendix', 'patella', 'phalanx', 'trachea', 'vertebra',
  ],
  City: [
    'baku', 'suva', 'apia', 'sanaa', 'kabul', 'accra', 'dakar', 'minsk', 'tbilisi', 'yerevan', 'kigali',
    'tashkent', 'muscat', 'bishkek', 'reykjavik', 'thimphu', 'windhoek', 'zagreb', 'vilnius', 'tallinn',
  ].filter((w) => w.length >= 4 && w.length <= 8),
  Clothing: [
    'fedora', 'kaftan', 'cravat', 'fez', 'sombrero', 'jodhpurs', 'galoshes', 'bodice', 'cummerbund', 'lederhosen',
    'tiara', 'parka', 'dhoti', 'kurta', 'hijab', 'gaiters', 'spats', 'tabard',
  ].filter((w) => w.length >= 4 && w.length <= 8),
  Color: [
    'puce', 'ecru', 'umber', 'sepia', 'taupe', 'cerise', 'sienna', 'vermilion', 'chartreuse', 'fuchsia', 'zaffre',
    'mustard', 'auburn', 'carmine', 'heliotrope', 'periwinkle', 'cerulean', 'viridian',
  ].filter((w) => w.length >= 4 && w.length <= 8),
  Country: [
    'tuvalu', 'kiribati', 'vanuatu', 'eritrea', 'djibouti', 'lesotho', 'eswatini', 'suriname', 'belarus', 'kosovo',
    'bhutan', 'myanmar', 'comoros', 'andorra', 'moldova', 'burundi', 'botswana', 'mongolia', 'zambia', 'uruguay',
  ],
  Food: [
    'quiche', 'gnocchi', 'kimchi', 'sorbet', 'goulash', 'tzatziki', 'borscht', 'brioche', 'focaccia', 'ceviche',
    'churro', 'gelato', 'pilaf', 'biryani', 'jalebi', 'tempura', 'haggis', 'zucchini', 'quinoa', 'yogurt',
  ].filter((w) => w.length >= 4 && w.length <= 8),
  Fruit: [
    'yuzu', 'kumquat', 'quince', 'durian', 'rambutan', 'longan', 'mangosteen', 'jujube', 'persimmon',
    'sapodilla', 'soursop', 'pawpaw', 'salak', 'cherimoya', 'boysenberry', 'elderberry', 'huckleberry',
  ].filter((w) => w.length >= 4 && w.length <= 8),
  Home: [
    'alcove', 'gazebo', 'foyer', 'joist', 'gable', 'trellis', 'pergola', 'skirting', 'parapet', 'duvet',
    'bidet', 'futon', 'jacuzzi', 'chaise', 'armoire', 'sconce', 'credenza', 'veranda',
  ].filter((w) => w.length >= 4 && w.length <= 8),
  Job: [
    'cooper', 'farrier', 'glazier', 'vintner', 'chandler', 'sommelier', 'jeweller', 'zookeeper', 'actuary', 'notary',
    'bailiff', 'tanner', 'quarrier', 'yeoman', 'vicar', 'jester', 'squire', 'falconer', 'wrangler',
  ].filter((w) => w.length >= 4 && w.length <= 8),
  Music: [
    'zither', 'kazoo', 'lyre', 'fugue', 'oboe', 'timpani', 'piccolo', 'bugle', 'banjo', 'ocarina', 'sackbut',
    'requiem', 'scherzo', 'cadenza', 'motif', 'jingle', 'kalimba', 'didgeridoo', 'glockenspiel',
  ].filter((w) => w.length >= 4 && w.length <= 8),
  Nature: [
    'fjord', 'atoll', 'mesa', 'bayou', 'butte', 'gorge', 'taiga', 'sierra', 'quagmire', 'zephyr', 'squall',
    'crevasse', 'isthmus', 'lagoon', 'aurora', 'equinox', 'solstice', 'tsunami', 'oasis',
  ].filter((w) => w.length >= 4 && w.length <= 8),
  Object: [
    'quill', 'jigsaw', 'yoyo', 'sextant', 'abacus', 'zipper', 'kazoo', 'sphinx', 'scythe', 'gavel', 'buckle',
    'thermos', 'corkscrew', 'jukebox', 'quiver', 'whisk', 'bauble', 'trinket', 'gizmo',
  ].filter((w) => w.length >= 4 && w.length <= 8),
  Science: [
    'quasar', 'pulsar', 'zygote', 'helix', 'enzyme', 'axon', 'lymph', 'pixel', 'vortex', 'quantum', 'joule',
    'kelvin', 'boson', 'meiosis', 'mitosis', 'osmosis', 'synapse', 'xylem', 'phloem', 'zenith',
  ].filter((w) => w.length >= 4 && w.length <= 8),
  Sport: [
    'jiujitsu', 'kabaddi', 'hurling', 'polo', 'squash', 'bobsled', 'parkour', 'slalom', 'jousting',
    'skeleton', 'decathlon', 'kayaking', 'sculling', 'judo', 'aikido',
  ].filter((w) => w.length >= 4 && w.length <= 8),
  Tech: [
    'qubit', 'proxy', 'cache', 'codec', 'daemon', 'kernel', 'syntax', 'payload', 'pixel',
    'checksum', 'bitmap', 'bytecode', 'vector', 'compiler', 'hashtag', 'captcha', 'emulator',
  ].filter((w) => w.length >= 4 && w.length <= 8),
  Vehicle: [
    'junk', 'skiff', 'sampan', 'rickshaw', 'jetski', 'galleon', 'frigate', 'trireme', 'dirigible',
    'quadbike', 'hydrofoil', 'caravan', 'schooner', 'velocipede',
  ].filter((w) => w.length >= 4 && w.length <= 8),
};
