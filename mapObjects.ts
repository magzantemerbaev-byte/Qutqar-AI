import type { MapObject } from '../types';

/**
 * ДЕМОНСТРАЦИОННЫЕ ДАННЫЕ (DEMO).
 * Все происшествия, подразделения и объекты вымышлены. Координаты приблизительные и привязаны
 * к городам РК только для наглядности. Здесь нет реальных контактов, статистики или сведений МЧС РК.
 * Переводы полей (tr / detailsTr) нужны только для демонстрации интерфейса на трех языках.
 */
type TrPart = { title: string; description: string; status?: string; region: string };
const tr = (kz: TrPart, en: TrPart) => ({ kz, en });

export const INCIDENTS: MapObject[] = [
  {
    id: 'inc-001', type: 'fire', title: 'Возгорание степной территории', city: 'krg', regionId: 'kar',
    region: 'Карагандинская обл., Бухар-Жырауский р-н', lat: 50.24, lng: 73.58,
    description: 'Горение сухой растительности на открытой местности. Фронт огня смещается под действием ветра.',
    status: 'Тушение', threat: 'high', time: '09:42', people: { atRisk: 0 },
    details: [{ label: 'Площадь', value: '≈ 45 га' }, { label: 'Ветер', value: 'ЮЗ, 12 м/с' }, { label: 'Задействовано', value: '2 расчета, 1 БПЛА' }, { label: 'Ближайший н. п.', value: '≈ 11 км (условно)' }],
    tr: tr({ title: 'Дала аумағының жануы', description: 'Ашық жердегі құрғақ өсімдіктің жануы. Өрт шебі желдің әсерінен жылжуда.', status: 'Сөндіру', region: 'Қарағанды облысы, Бұқар жырау ауданы' },
      { title: 'Steppe fire', description: 'Dry vegetation burning in open country. The fire front is moving with the wind.', status: 'Firefighting', region: 'Karaganda Region, Bukhar-Zhyrau District' }),
    detailsTr: {
      kz: [{ label: 'Аумақ', value: '≈ 45 га' }, { label: 'Жел', value: 'ОБ, 12 м/с' }, { label: 'Тартылды', value: '2 есеп, 1 ҰҰА' }, { label: 'Жақын елді мекен', value: '≈ 11 км (шартты)' }],
      en: [{ label: 'Area', value: '≈ 45 ha' }, { label: 'Wind', value: 'SW, 12 m/s' }, { label: 'Committed', value: '2 crews, 1 drone' }, { label: 'Nearest settlement', value: '≈ 11 km (notional)' }],
    },
  },
  {
    id: 'inc-002', type: 'fire', title: 'Пожар в жилом доме', city: 'ala', regionId: 'ala',
    region: 'г. Алматы, Алмалинский р-н', lat: 43.252, lng: 76.912,
    description: 'Горение квартиры на 3-м этаже 5-этажного жилого дома, задымление подъезда.',
    status: 'Локализован', threat: 'medium', time: '11:15', people: { evacuated: 18, injured: 1 },
    details: [{ label: 'Площадь', value: '≈ 40 м²' }, { label: 'Эвакуировано', value: '18 чел.' }, { label: 'Задействовано', value: '3 АЦ, 1 АЛ' }, { label: 'Пострадавшие', value: '1 (отравление дымом)' }],
    tr: tr({ title: 'Тұрғын үйдегі өрт', description: '5 қабатты тұрғын үйдің 3-қабатындағы пәтердің жануы, кіреберістің түтіндеуі.', status: 'Оқшауланды', region: 'Алматы қ., Алмалы ауданы' },
      { title: 'Residential building fire', description: 'Apartment fire on the 3rd floor of a 5-storey block; the stairwell is smoke-logged.', status: 'Contained', region: 'Almaty, Almaly District' }),
    detailsTr: {
      kz: [{ label: 'Аумақ', value: '≈ 40 м²' }, { label: 'Көшірілді', value: '18 адам' }, { label: 'Тартылды', value: '3 АЦ, 1 АС' }, { label: 'Зардап шеккендер', value: '1 (түтіннен улану)' }],
      en: [{ label: 'Area', value: '≈ 40 m²' }, { label: 'Evacuated', value: '18 people' }, { label: 'Committed', value: '3 engines, 1 ladder' }, { label: 'Casualties', value: '1 (smoke inhalation)' }],
    },
  },
  {
    id: 'inc-003', type: 'flood', title: 'Подтопление жилого сектора', city: 'ptr', regionId: 'sko',
    region: 'СКО, г. Петропавловск, пойма р. Есиль', lat: 54.855, lng: 69.12,
    description: 'Подъем уровня воды, подтоплено 14 приусадебных участков. Ведется откачка.',
    status: 'Мониторинг', threat: 'high', time: '06:30', people: { evacuated: 9, atRisk: 20 },
    details: [{ label: 'Уровень воды', value: '+38 см за сутки' }, { label: 'Подтоплено', value: '14 участков' }, { label: 'Эвакуировано', value: '9 чел.' }, { label: 'Техника', value: '4 мотопомпы, 2 лодки' }],
    tr: tr({ title: 'Тұрғын секторды су басу', description: 'Су деңгейі көтерілуде, 14 үй маңы учаскесін су басты. Су сорылуда.', status: 'Бақылау', region: 'СҚО, Петропавл қ., Есіл өзенінің жайылмасы' },
      { title: 'Flooding of a residential area', description: 'Rising water level; 14 household plots flooded. Pumping is under way.', status: 'Monitoring', region: 'North Kazakhstan, Petropavl, Yesil floodplain' }),
    detailsTr: {
      kz: [{ label: 'Су деңгейі', value: 'тәулігіне +38 см' }, { label: 'Су басты', value: '14 учаске' }, { label: 'Көшірілді', value: '9 адам' }, { label: 'Техника', value: '4 мотопомпа, 2 қайық' }],
      en: [{ label: 'Water level', value: '+38 cm per day' }, { label: 'Flooded', value: '14 plots' }, { label: 'Evacuated', value: '9 people' }, { label: 'Equipment', value: '4 pumps, 2 boats' }],
    },
  },
  {
    id: 'inc-004', type: 'accident', title: 'ДТП с участием 3 автомобилей', city: 'shch', regionId: 'akm',
    region: 'Трасса Астана — Щучинск, 97 км', lat: 51.95, lng: 70.96,
    description: 'Столкновение трех легковых автомобилей, требуется деблокирование пострадавшего.',
    status: 'Спасательные работы', threat: 'medium', time: '12:05', people: { injured: 4, atRisk: 1 },
    details: [{ label: 'Пострадавшие', value: '4 (1 зажат в ТС)' }, { label: 'Движение', value: 'Частично перекрыто' }, { label: 'Задействовано', value: '1 АСА, 1 АЦ, СМП' }, { label: 'Погода', value: '+9 °C, мокрое покрытие' }],
    tr: tr({ title: '3 көлік қатысқан ЖКО', description: 'Үш жеңіл көлік соқтығысты, зардап шеккенді бұғаттан шығару қажет.', status: 'Құтқару жұмыстары', region: 'Астана — Щучинск трассасы, 97 км' },
      { title: 'Three-vehicle collision', description: 'Three cars collided; one casualty needs extrication.', status: 'Rescue in progress', region: 'Astana — Shchuchinsk highway, km 97' }),
    detailsTr: {
      kz: [{ label: 'Зардап шеккендер', value: '4 (1 көлікте қысылған)' }, { label: 'Қозғалыс', value: 'Ішінара жабылған' }, { label: 'Тартылды', value: '1 АҚК, 1 АЦ, ЖМК' }, { label: 'Ауа райы', value: '+9 °C, дымқыл жабын' }],
      en: [{ label: 'Casualties', value: '4 (1 trapped)' }, { label: 'Traffic', value: 'Partially closed' }, { label: 'Committed', value: '1 rescue unit, 1 engine, EMS' }, { label: 'Weather', value: '+9 °C, wet road' }],
    },
  },
  {
    id: 'inc-005', type: 'hazard', title: 'Утечка аммиака на холодильной установке', city: 'pvl', regionId: 'pav',
    region: 'г. Павлодар, промышленная зона', lat: 52.335, lng: 76.99,
    description: 'Разгерметизация трубопровода аммиачной холодильной установки (учебный сценарий).',
    status: 'Разведка', threat: 'high', time: '10:20', people: { evacuated: 32 },
    details: [{ label: 'Вещество', value: 'Аммиак (NH₃)' }, { label: 'Зона оцепления', value: '300 м (условно)' }, { label: 'Персонал выведен', value: '32 чел.' }, { label: 'Ветер', value: 'З, 5 м/с' }],
    tr: tr({ title: 'Тоңазытқыш қондырғыдағы аммиак ағуы', description: 'Аммиак тоңазытқыш қондырғысы құбырының саңылаусыздануы (оқу сценарийі).', status: 'Барлау', region: 'Павлодар қ., өнеркәсіп аймағы' },
      { title: 'Ammonia leak at a refrigeration plant', description: 'Pipe failure on an ammonia refrigeration unit (training scenario).', status: 'Reconnaissance', region: 'Pavlodar, industrial zone' }),
    detailsTr: {
      kz: [{ label: 'Зат', value: 'Аммиак (NH₃)' }, { label: 'Қоршау аймағы', value: '300 м (шартты)' }, { label: 'Персонал шығарылды', value: '32 адам' }, { label: 'Жел', value: 'Б, 5 м/с' }],
      en: [{ label: 'Substance', value: 'Ammonia (NH₃)' }, { label: 'Cordon', value: '300 m (notional)' }, { label: 'Staff evacuated', value: '32 people' }, { label: 'Wind', value: 'W, 5 m/s' }],
    },
  },
  {
    id: 'inc-006', type: 'flood', title: 'Заторная ситуация на реке', city: 'aktb', regionId: 'akt',
    region: 'Актюбинская обл., р. Илек', lat: 50.05, lng: 57.55,
    description: 'Формирование ледового затора, угрозы населенным пунктам на текущий момент нет.',
    status: 'Наблюдение', threat: 'low', time: '08:10',
    details: [{ label: 'Протяженность затора', value: '≈ 1,2 км' }, { label: 'Наблюдение', value: 'БПЛА, 2 раза в сутки' }],
    tr: tr({ title: 'Өзендегі кептеліс', description: 'Мұз кептелісі қалыптасуда, қазіргі уақытта елді мекендерге қауіп жоқ.', status: 'Бақылау', region: 'Ақтөбе облысы, Елек өзені' },
      { title: 'Ice jam on a river', description: 'An ice jam is forming; no current threat to settlements.', status: 'Observation', region: 'Aktobe Region, Ilek River' }),
    detailsTr: {
      kz: [{ label: 'Кептеліс ұзындығы', value: '≈ 1,2 км' }, { label: 'Бақылау', value: 'ҰҰА, тәулігіне 2 рет' }],
      en: [{ label: 'Jam length', value: '≈ 1.2 km' }, { label: 'Monitoring', value: 'Drone, twice a day' }],
    },
  },
  {
    id: 'inc-007', type: 'fire', title: 'Лесной пожар в ленточном бору', city: 'sem', regionId: 'aba',
    region: 'Абайская обл., лесной массив у г. Семей', lat: 50.52, lng: 80.05,
    description: 'Низовой пожар в сосновом бору, возможен переход в верховой при усилении ветра (учебные данные).',
    status: 'Тушение', threat: 'critical', time: '13:20', people: { atRisk: 60 },
    details: [{ label: 'Площадь', value: '≈ 12 га' }, { label: 'Ветер', value: 'СЗ, 9 м/с' }, { label: 'Рядом', value: 'Дачный массив ≈ 60 чел.' }],
    tr: tr({ title: 'Таспа орманындағы орман өрті', description: 'Қарағайлы ормандағы төменгі өрт, жел күшейсе жоғарғы өртке ауысуы мүмкін (оқу деректері).', status: 'Сөндіру', region: 'Абай облысы, Семей қ. маңындағы орман алқабы' },
      { title: 'Forest fire in a ribbon pine forest', description: 'Surface fire in a pine forest; may become a crown fire if the wind strengthens (training data).', status: 'Firefighting', region: 'Abai Region, forest near Semey' }),
    detailsTr: {
      kz: [{ label: 'Аумақ', value: '≈ 12 га' }, { label: 'Жел', value: 'СБ, 9 м/с' }, { label: 'Жақын маңда', value: 'Саяжай алқабы ≈ 60 адам' }],
      en: [{ label: 'Area', value: '≈ 12 ha' }, { label: 'Wind', value: 'NW, 9 m/s' }, { label: 'Nearby', value: 'Dacha area ≈ 60 people' }],
    },
  },
  {
    id: 'inc-008', type: 'fire', title: 'Пожар на складе', city: 'taraz', regionId: 'zhm',
    region: 'г. Тараз, промышленная зона', lat: 42.88, lng: 71.41,
    description: 'Горение складского помещения со стройматериалами, сильное задымление (учебные данные).',
    status: 'Разведка', threat: 'medium', time: '14:05', people: { evacuated: 12 },
    details: [{ label: 'Площадь', value: '≈ 300 м²' }, { label: 'Эвакуировано', value: '12 чел.' }],
    tr: tr({ title: 'Қоймадағы өрт', description: 'Құрылыс материалдары бар қойма үй-жайының жануы, қатты түтін (оқу деректері).', status: 'Барлау', region: 'Тараз қ., өнеркәсіп аймағы' },
      { title: 'Warehouse fire', description: 'A building-materials warehouse is burning with heavy smoke (training data).', status: 'Reconnaissance', region: 'Taraz, industrial zone' }),
    detailsTr: {
      kz: [{ label: 'Аумақ', value: '≈ 300 м²' }, { label: 'Көшірілді', value: '12 адам' }],
      en: [{ label: 'Area', value: '≈ 300 m²' }, { label: 'Evacuated', value: '12 people' }],
    },
  },
  {
    id: 'inc-009', type: 'hazard', title: 'Запах газа в жилом доме', city: 'shy', regionId: 'shy',
    region: 'г. Шымкент, Абайский р-н', lat: 42.33, lng: 69.57,
    description: 'Сообщение о запахе газа в подъезде многоквартирного дома (учебные данные).',
    status: 'Проверка', threat: 'medium', time: '15:40', people: { evacuated: 24 },
    details: [{ label: 'Эвакуировано', value: '24 чел.' }, { label: 'Газоснабжение', value: 'Отключено аварийной службой' }],
    tr: tr({ title: 'Тұрғын үйдегі газ иісі', description: 'Көппәтерлі үйдің кіреберісінде газ иісі туралы хабарлама (оқу деректері).', status: 'Тексеру', region: 'Шымкент қ., Абай ауданы' },
      { title: 'Gas smell in an apartment block', description: 'Report of a gas smell in the stairwell of an apartment block (training data).', status: 'Checking', region: 'Shymkent, Abai District' }),
    detailsTr: {
      kz: [{ label: 'Көшірілді', value: '24 адам' }, { label: 'Газбен жабдықтау', value: 'Авариялық қызмет ажыратты' }],
      en: [{ label: 'Evacuated', value: '24 people' }, { label: 'Gas supply', value: 'Shut off by the utility' }],
    },
  },
  {
    id: 'inc-010', type: 'accident', title: 'ДТП с пассажирским автобусом', city: 'kok', regionId: 'akm',
    region: 'Трасса у г. Кокшетау', lat: 53.21, lng: 69.52,
    description: 'Съезд автобуса в кювет, есть пострадавшие (учебные данные).',
    status: 'Спасательные работы', threat: 'high', time: '16:10', people: { known: 22, injured: 6 },
    details: [{ label: 'Пассажиров', value: '22' }, { label: 'Пострадавшие', value: '6' }],
    tr: tr({ title: 'Жолаушылар автобусымен ЖКО', description: 'Автобус жол жиегіндегі арыққа түсті, зардап шеккендер бар (оқу деректері).', status: 'Құтқару жұмыстары', region: 'Көкшетау қ. маңындағы трасса' },
      { title: 'Passenger bus crash', description: 'A bus left the road into a ditch; there are casualties (training data).', status: 'Rescue in progress', region: 'Highway near Kokshetau' }),
    detailsTr: {
      kz: [{ label: 'Жолаушылар', value: '22' }, { label: 'Зардап шеккендер', value: '6' }],
      en: [{ label: 'Passengers', value: '22' }, { label: 'Casualties', value: '6' }],
    },
  },
];

type ResTr = { title: string; description: string; region: string };
const r = (o: Omit<MapObject, 'tr'>, kz: ResTr, en: ResTr): MapObject => ({ ...o, tr: { kz, en } });
export const RESOURCES: MapObject[] = [
  r({ id: 'u-01', type: 'unit', title: 'ПЧ №1 (условно)', region: 'г. Астана', lat: 51.17, lng: 71.43, description: 'Пожарная часть, 4 АЦ, 1 АЛ, 1 АСА', status: 'В готовности' }, { title: '№1 ӨСБ (шартты)', description: 'Өрт сөндіру бөлімі, 4 АЦ, 1 АС, 1 АҚК', region: 'Астана қ.' }, { title: 'Fire station 1 (notional)', description: 'Fire station, 4 engines, 1 ladder, 1 rescue unit', region: 'Astana' }),
  r({ id: 'u-02', type: 'unit', title: 'ПЧ пос. Ботакара (условно)', region: 'Карагандинская обл.', lat: 50.06, lng: 73.72, description: 'Пожарный пост, 2 АЦ повышенной проходимости', status: 'На выезде' }, { title: 'Ботақара кентінің ӨСБ (шартты)', description: 'Өрт бекеті, жүрісі жоғары 2 АЦ', region: 'Қарағанды облысы' }, { title: 'Botakara fire post (notional)', description: 'Fire post, 2 off-road engines', region: 'Karaganda Region' }),
  r({ id: 'u-03', type: 'unit', title: 'СПЧ г. Караганда (условно)', region: 'г. Караганда', lat: 49.81, lng: 73.09, description: 'Специализированная пожарная часть, БПЛА', status: 'На выезде' }, { title: 'Қарағанды қ. МӨСБ (шартты)', description: 'Мамандандырылған өрт сөндіру бөлімі, ҰҰА', region: 'Қарағанды қ.' }, { title: 'Karaganda special fire unit (notional)', description: 'Specialised fire unit, drones', region: 'Karaganda' }),
  r({ id: 'u-04', type: 'unit', title: 'СПЧ г. Алматы (условно)', region: 'г. Алматы', lat: 43.24, lng: 76.95, description: 'Специализированная пожарная часть, 2 АЛ-50', status: 'На месте' }, { title: 'Алматы қ. МӨСБ (шартты)', description: 'Мамандандырылған өрт сөндіру бөлімі, 2 АС-50', region: 'Алматы қ.' }, { title: 'Almaty special fire unit (notional)', description: 'Specialised fire unit, 2 × 50 m ladders', region: 'Almaty' }),
  r({ id: 'u-05', type: 'unit', title: 'ПЧ г. Павлодар (условно)', region: 'г. Павлодар', lat: 52.285, lng: 76.94, description: 'Пожарная часть, отделение РХБЗ', status: 'На месте' }, { title: 'Павлодар қ. ӨСБ (шартты)', description: 'Өрт сөндіру бөлімі, РХБҚ бөлімшесі', region: 'Павлодар қ.' }, { title: 'Pavlodar fire station (notional)', description: 'Fire station with a CBRN team', region: 'Pavlodar' }),
  r({ id: 'u-06', type: 'unit', title: 'ПЧ г. Петропавловск (условно)', region: 'СКО', lat: 54.875, lng: 69.16, description: 'Пожарная часть, плавсредства', status: 'На месте' }, { title: 'Петропавл қ. ӨСБ (шартты)', description: 'Өрт сөндіру бөлімі, жүзу құралдары', region: 'СҚО' }, { title: 'Petropavl fire station (notional)', description: 'Fire station with boats', region: 'North Kazakhstan' }),
  r({ id: 'u-07', type: 'unit', title: 'Оперативно-спасательный отряд (условно)', region: 'г. Кокшетау', lat: 53.28, lng: 69.39, description: 'АСА, гидравлический инструмент', status: 'В пути' }, { title: 'Жедел-құтқару жасағы (шартты)', description: 'АҚК, гидравликалық құрал', region: 'Көкшетау қ.' }, { title: 'Rescue detachment (notional)', description: 'Rescue vehicle, hydraulic tools', region: 'Kokshetau' }),
  r({ id: 'u-08', type: 'unit', title: 'ПЧ г. Шымкент (условно)', region: 'г. Шымкент', lat: 42.32, lng: 69.6, description: 'Пожарная часть, 3 АЦ', status: 'В готовности' }, { title: 'Шымкент қ. ӨСБ (шартты)', description: 'Өрт сөндіру бөлімі, 3 АЦ', region: 'Шымкент қ.' }, { title: 'Shymkent fire station (notional)', description: 'Fire station, 3 engines', region: 'Shymkent' }),
  r({ id: 'h-01', type: 'hospital', title: 'Многопрофильная больница (условно)', region: 'г. Астана', lat: 51.13, lng: 71.45, description: 'Приемный покой, травматология, ожоговое отделение' }, { title: 'Көпбейінді аурухана (шартты)', description: 'Қабылдау бөлімі, травматология, күйік бөлімшесі', region: 'Астана қ.' }, { title: 'General hospital (notional)', description: 'Emergency department, trauma, burns unit', region: 'Astana' }),
  r({ id: 'h-02', type: 'hospital', title: 'Городская больница (условно)', region: 'г. Алматы', lat: 43.23, lng: 76.87, description: 'Приемный покой, токсикология' }, { title: 'Қалалық аурухана (шартты)', description: 'Қабылдау бөлімі, токсикология', region: 'Алматы қ.' }, { title: 'City hospital (notional)', description: 'Emergency department, toxicology', region: 'Almaty' }),
  r({ id: 'h-03', type: 'hospital', title: 'Областная больница (условно)', region: 'г. Караганда', lat: 49.83, lng: 73.15, description: 'Ожоговый центр' }, { title: 'Облыстық аурухана (шартты)', description: 'Күйік орталығы', region: 'Қарағанды қ.' }, { title: 'Regional hospital (notional)', description: 'Burns centre', region: 'Karaganda' }),
  r({ id: 'h-04', type: 'hospital', title: 'Городская больница (условно)', region: 'г. Павлодар', lat: 52.27, lng: 76.96, description: 'Токсикологическое отделение' }, { title: 'Қалалық аурухана (шартты)', description: 'Токсикология бөлімшесі', region: 'Павлодар қ.' }, { title: 'City hospital (notional)', description: 'Toxicology unit', region: 'Pavlodar' }),
  r({ id: 'w-01', type: 'water', title: 'Водохранилище (забор воды)', region: 'Карагандинская обл.', lat: 50.08, lng: 72.97, description: 'Пирс для забора воды пожарными автомобилями (условно)' }, { title: 'Су қоймасы (су алу)', description: 'Өрт сөндіру көліктерінің су алуына арналған пирс (шартты)', region: 'Қарағанды облысы' }, { title: 'Reservoir (water intake)', description: 'Pier for fire engines to draw water (notional)', region: 'Karaganda Region' }),
  r({ id: 'w-02', type: 'water', title: 'Пирс на р. Иртыш', region: 'г. Павлодар', lat: 52.31, lng: 76.925, description: 'Круглогодичный забор воды (условно)' }, { title: 'Ертіс өзеніндегі пирс', description: 'Жыл бойы су алу (шартты)', region: 'Павлодар қ.' }, { title: 'Irtysh river pier', description: 'Year-round water intake (notional)', region: 'Pavlodar' }),
  r({ id: 'w-03', type: 'water', title: 'Пожарный водоем на трассе', region: 'Акмолинская обл.', lat: 51.9, lng: 71.02, description: 'Водоем 100 м³ (условно)' }, { title: 'Трассадағы өрт су айдыны', description: '100 м³ су айдыны (шартты)', region: 'Ақмола облысы' }, { title: 'Roadside fire pond', description: '100 m³ pond (notional)', region: 'Akmola Region' }),
];

export const ALL_OBJECTS: MapObject[] = [...INCIDENTS, ...RESOURCES];

/** Расстояние по дуге большого круга, км */
export { distanceKm } from '../../shared/engine/resources';
