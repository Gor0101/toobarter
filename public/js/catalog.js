/* Справочники. Ключ хранится в базе, подписи переводятся на лету. */

window.CITIES = [
  ['yerevan', 'Երևան', 'Ереван', 'Yerevan'],
  ['gyumri', 'Գյումրի', 'Гюмри', 'Gyumri'],
  ['vanadzor', 'Վանաձոր', 'Ванадзор', 'Vanadzor'],
  ['abovyan', 'Աբովյան', 'Абовян', 'Abovyan'],
  ['hrazdan', 'Հրազդան', 'Раздан', 'Hrazdan'],
  ['ejmiatsin', 'Էջմիածին', 'Эчмиадзин', 'Ejmiatsin'],
  ['armavir', 'Արմավիր', 'Армавир', 'Armavir'],
  ['gavar', 'Գավառ', 'Гавар', 'Gavar'],
  ['artashat', 'Արտաշատ', 'Арташат', 'Artashat'],
  ['ashtarak', 'Աշտարակ', 'Аштарак', 'Ashtarak'],
  ['ijevan', 'Իջևան', 'Иджеван', 'Ijevan'],
  ['sevan', 'Սևան', 'Севан', 'Sevan'],
  ['dilijan', 'Դիլիջան', 'Дилижан', 'Dilijan'],
  ['charentsavan', 'Չարենցավան', 'Чаренцаван', 'Charentsavan'],
  ['masis', 'Մասիս', 'Масис', 'Masis'],
  ['kapan', 'Կապան', 'Капан', 'Kapan'],
  ['goris', 'Գորիս', 'Горис', 'Goris'],
  ['stepanavan', 'Ստեփանավան', 'Степанаван', 'Stepanavan'],
  ['alaverdi', 'Ալավերդի', 'Алаверди', 'Alaverdi'],
  ['vedi', 'Վեդի', 'Веди', 'Vedi'],
  ['jermuk', 'Ջերմուկ', 'Джермук', 'Jermuk'],
  ['tsaghkadzor', 'Ծաղկաձոր', 'Цахкадзор', 'Tsaghkadzor'],
  ['other', 'Այլ', 'Другой', 'Other'],
];

window.OPTIONS = {
  body: [
    ['sedan', 'Սեդան', 'Седан', 'Sedan'],
    ['hatchback', 'Հեչբեք', 'Хэтчбек', 'Hatchback'],
    ['wagon', 'Ունիվերսալ', 'Универсал', 'Wagon'],
    ['suv', 'Ամենագնաց', 'Внедорожник', 'SUV'],
    ['crossover', 'Կրոսովեր', 'Кроссовер', 'Crossover'],
    ['coupe', 'Կուպե', 'Купе', 'Coupe'],
    ['minivan', 'Մինիվեն', 'Минивэн', 'Minivan'],
    ['pickup', 'Պիկափ', 'Пикап', 'Pickup'],
    ['cabriolet', 'Կաբրիոլետ', 'Кабриолет', 'Cabriolet'],
    ['van', 'Ֆուրգոն', 'Фургон', 'Van'],
  ],
  transmission: [
    ['manual', 'Մեխանիկական', 'Механика', 'Manual'],
    ['automatic', 'Ավտոմատ', 'Автомат', 'Automatic'],
    ['tiptronic', 'Տիպտրոնիկ', 'Типтроник', 'Tiptronic'],
    ['variator', 'Վարիատոր', 'Вариатор', 'CVT'],
  ],
  fuel: [
    ['petrol', 'Բենզին', 'Бензин', 'Petrol'],
    ['diesel', 'Դիզել', 'Дизель', 'Diesel'],
    ['gas', 'Գազ', 'Газ', 'LPG / CNG'],
    ['hybrid', 'Հիբրիդ', 'Гибрид', 'Hybrid'],
    ['electric', 'Էլեկտրական', 'Электро', 'Electric'],
  ],
  drive: [
    ['fwd', 'Առջևի', 'Передний', 'Front'],
    ['rwd', 'Հետևի', 'Задний', 'Rear'],
    ['awd', 'Լրիվ', 'Полный', 'All-wheel'],
  ],
  color: [
    ['white', 'Սպիտակ', 'Белый', 'White'],
    ['black', 'Սև', 'Чёрный', 'Black'],
    ['silver', 'Արծաթագույն', 'Серебристый', 'Silver'],
    ['grey', 'Մոխրագույն', 'Серый', 'Grey'],
    ['blue', 'Կապույտ', 'Синий', 'Blue'],
    ['red', 'Կարմիր', 'Красный', 'Red'],
    ['green', 'Կանաչ', 'Зелёный', 'Green'],
    ['beige', 'Բեժ', 'Бежевый', 'Beige'],
    ['brown', 'Շագանակագույն', 'Коричневый', 'Brown'],
    ['other', 'Այլ', 'Другой', 'Other'],
  ],
  condition: [
    ['new_repair', 'Նոր վերանորոգված', 'Новый ремонт', 'Newly renovated'],
    ['good', 'Լավ վիճակում', 'Хорошее', 'Good'],
    ['needs_repair', 'Վերանորոգման կարիք ունի', 'Требует ремонта', 'Needs renovation'],
    ['zero', 'Զրոյական վիճակ', 'Нулевое', 'Bare shell'],
    ['unfinished', 'Կիսակառույց', 'Стройвариант', 'Unfinished'],
  ],
};

window.CAR_MAKES = {
  'Mercedes-Benz': ['A-Class', 'C-Class', 'E-Class', 'S-Class', 'CLA', 'CLS', 'GLA', 'GLC', 'GLE', 'GLK', 'GLS', 'ML', 'Sprinter', 'Vito'],
  Toyota: ['Camry', 'Corolla', 'RAV4', 'Land Cruiser', 'Land Cruiser Prado', 'Highlander', 'Yaris', 'Avalon', 'Prius', 'Hilux', 'C-HR', 'Venza'],
  BMW: ['1 Series', '3 Series', '5 Series', '7 Series', 'X1', 'X3', 'X5', 'X6', 'X7', 'M3', 'M5'],
  Nissan: ['Altima', 'Sentra', 'Rogue', 'X-Trail', 'Qashqai', 'Murano', 'Pathfinder', 'Juke', 'Leaf', 'Patrol', 'Teana'],
  Hyundai: ['Accent', 'Elantra', 'Sonata', 'Tucson', 'Santa Fe', 'Creta', 'i30', 'Kona', 'Palisade'],
  Kia: ['Rio', 'Cerato', 'Optima', 'K5', 'Sportage', 'Sorento', 'Seltos', 'Soul', 'Picanto'],
  Volkswagen: ['Golf', 'Passat', 'Polo', 'Jetta', 'Tiguan', 'Touareg', 'Caddy', 'Transporter'],
  Opel: ['Astra', 'Corsa', 'Insignia', 'Vectra', 'Zafira', 'Mokka'],
  Ford: ['Focus', 'Fusion', 'Mondeo', 'Escape', 'Explorer', 'Edge', 'Transit', 'Mustang'],
  Chevrolet: ['Aveo', 'Cruze', 'Malibu', 'Captiva', 'Equinox', 'Tahoe', 'Camaro', 'Spark'],
  Honda: ['Civic', 'Accord', 'CR-V', 'Fit', 'Pilot', 'HR-V', 'Odyssey'],
  Lexus: ['ES', 'IS', 'GS', 'LS', 'NX', 'RX', 'GX', 'LX', 'UX'],
  Audi: ['A3', 'A4', 'A6', 'A8', 'Q3', 'Q5', 'Q7', 'Q8', 'TT'],
  Mitsubishi: ['Lancer', 'Outlander', 'Pajero', 'ASX', 'Eclipse Cross', 'L200'],
  Mazda: ['3', '6', 'CX-3', 'CX-5', 'CX-9', 'MX-5'],
  Subaru: ['Impreza', 'Legacy', 'Forester', 'Outback', 'XV', 'WRX'],
  Renault: ['Logan', 'Sandero', 'Duster', 'Megane', 'Captur', 'Kangoo'],
  Peugeot: ['206', '207', '208', '301', '308', '407', '3008', '508', 'Partner'],
  Skoda: ['Octavia', 'Fabia', 'Superb', 'Rapid', 'Kodiaq', 'Karoq'],
  Volvo: ['S60', 'S80', 'S90', 'XC40', 'XC60', 'XC90'],
  Jeep: ['Cherokee', 'Grand Cherokee', 'Wrangler', 'Compass', 'Renegade'],
  'Land Rover': ['Range Rover', 'Range Rover Sport', 'Range Rover Evoque', 'Discovery', 'Defender', 'Freelander'],
  Porsche: ['Cayenne', 'Macan', 'Panamera', '911', 'Taycan'],
  Tesla: ['Model 3', 'Model S', 'Model X', 'Model Y'],
  Infiniti: ['Q50', 'QX50', 'QX60', 'QX70', 'QX80', 'FX35'],
  Acura: ['MDX', 'RDX', 'TLX', 'ZDX'],
  Suzuki: ['Grand Vitara', 'Swift', 'SX4', 'Jimny', 'Vitara'],
  Fiat: ['500', 'Punto', 'Doblo', 'Tipo'],
  Citroen: ['C3', 'C4', 'C5', 'Berlingo'],
  Dodge: ['Charger', 'Challenger', 'Journey', 'Durango', 'Caravan'],
  Cadillac: ['Escalade', 'CTS', 'SRX', 'XT5'],
  Chrysler: ['300C', 'Pacifica', 'Town & Country'],
  GAZ: ['Gazelle', 'Sobol', '3110'],
  LADA: ['2107', '2110', '2114', 'Granta', 'Niva', 'Vesta', 'Largus'],
  UAZ: ['Patriot', 'Hunter', '469', 'Buhanka'],
  ZAZ: ['968', 'Chance', 'Sens'],
  MINI: ['Cooper', 'Countryman', 'Clubman'],
  Jaguar: ['XE', 'XF', 'F-Pace', 'E-Pace'],
  'Great Wall': ['Haval H6', 'Hover', 'Wingle'],
  Chery: ['Tiggo 4', 'Tiggo 7', 'Tiggo 8', 'Arrizo'],
  Geely: ['Coolray', 'Atlas', 'Emgrand', 'Tugella'],
  BYD: ['Song', 'Han', 'Tang', 'Seal', 'Dolphin'],
};

/* Возвращает подпись справочника на текущем языке */
window.label = function (row) {
  const idx = { hy: 1, ru: 2, en: 3 }[window.I18N.lang] || 2;
  return row[idx];
};
window.lookup = function (list, key) {
  if (!key) return null;
  const row = list.find((r) => r[0] === key);
  return row ? window.label(row) : key;
};
