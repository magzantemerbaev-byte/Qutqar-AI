import type { RegionRisk, RiskAlert } from '../types';

/**
 * ДЕМОНСТРАЦИОННЫЕ ДАННЫЕ AI RISK CENTER.
 * Индексы риска (0–100) вымышлены и НЕ являются прогнозом МЧС РК или Казгидромета.
 * В рабочей версии источник — backend (/api/data/situation → risk), куда
 * поступают метеоданные, спутниковые термоточки, гидропосты и реестр опасных объектов.
 */
export const DEMO_REGIONS: RegionRisk[] = [
  { id: 'kar', region: 'Карагандинская обл.', lat: 49.8, lng: 73.1, risks: { fire: 86, flood: 12, weather: 64, hazmat: 58 }, drivers: { fire: 'Сухостой, ветер до 17 м/с, 6 термоточек за сутки', weather: 'Штормовое предупреждение: ветер', hazmat: 'Металлургия, горнодобыча' } },
  { id: 'uly', region: 'Улытауская обл.', lat: 47.8, lng: 67.7, risks: { fire: 81, flood: 5, weather: 55, hazmat: 34 }, drivers: { fire: 'Засушливая осень, низкая влажность' } },
  { id: 'aba', region: 'Абайская обл.', lat: 50.4, lng: 80.2, risks: { fire: 74, flood: 10, weather: 48, hazmat: 22 }, drivers: { fire: 'Степные пожары в соседних районах' } },
  { id: 'pav', region: 'Павлодарская обл.', lat: 52.3, lng: 76.95, risks: { fire: 69, flood: 14, weather: 52, hazmat: 77 }, drivers: { fire: 'Сухая трава, пойменные камыши', hazmat: 'Нефтехимия, ТЭЦ, хранение аммиака' } },
  { id: 'akm', region: 'Акмолинская обл.', lat: 53.28, lng: 69.39, risks: { fire: 72, flood: 18, weather: 46, hazmat: 30 }, drivers: { fire: 'Лесостепь Бурабая, сухая погода' } },
  { id: 'kos', region: 'Костанайская обл.', lat: 53.2, lng: 63.6, risks: { fire: 77, flood: 9, weather: 50, hazmat: 26 }, drivers: { fire: 'Пожнивные остатки после уборки' } },
  { id: 'sko', region: 'Северо-Казахстанская обл.', lat: 54.87, lng: 69.15, risks: { fire: 58, flood: 16, weather: 44, hazmat: 18 }, drivers: {} },
  { id: 'vko', region: 'Восточно-Казахстанская обл.', lat: 49.95, lng: 82.6, risks: { fire: 62, flood: 28, weather: 57, hazmat: 55 }, drivers: { weather: 'Ранние заморозки, горные районы', hazmat: 'Цветная металлургия' } },
  { id: 'zko', region: 'Западно-Казахстанская обл.', lat: 51.23, lng: 51.37, risks: { fire: 64, flood: 20, weather: 41, hazmat: 45 }, drivers: {} },
  { id: 'akt', region: 'Актюбинская обл.', lat: 50.28, lng: 57.17, risks: { fire: 60, flood: 11, weather: 43, hazmat: 49 }, drivers: {} },
  { id: 'atr', region: 'Атырауская обл.', lat: 47.1, lng: 51.9, risks: { fire: 38, flood: 22, weather: 47, hazmat: 82 }, drivers: { hazmat: 'Нефтегазовые объекты, сероводород' } },
  { id: 'man', region: 'Мангистауская обл.', lat: 43.65, lng: 51.17, risks: { fire: 25, flood: 8, weather: 62, hazmat: 71 }, drivers: { weather: 'Пыльные бури', hazmat: 'Нефтегазовые объекты' } },
  { id: 'kyz', region: 'Кызылординская обл.', lat: 44.85, lng: 65.5, risks: { fire: 45, flood: 34, weather: 49, hazmat: 28 }, drivers: { flood: 'Попуски на Сырдарье' } },
  { id: 'tur', region: 'Туркестанская обл.', lat: 43.3, lng: 68.25, risks: { fire: 40, flood: 30, weather: 38, hazmat: 24 }, drivers: {} },
  { id: 'zhm', region: 'Жамбылская обл.', lat: 42.9, lng: 71.37, risks: { fire: 48, flood: 19, weather: 35, hazmat: 33 }, drivers: {} },
  { id: 'alr', region: 'Алматинская обл.', lat: 43.87, lng: 77.07, risks: { fire: 44, flood: 41, weather: 58, hazmat: 21 }, drivers: { flood: 'Селевая опасность после ливней', weather: 'Ливни в предгорьях' } },
  { id: 'zht', region: 'Жетысуская обл.', lat: 45.0, lng: 78.4, risks: { fire: 50, flood: 36, weather: 53, hazmat: 15 }, drivers: { flood: 'Селевая опасность' } },
  { id: 'ast', region: 'г. Астана', lat: 51.17, lng: 71.43, risks: { fire: 35, flood: 7, weather: 51, hazmat: 40 }, drivers: { weather: 'Порывистый ветер до 20 м/с' } },
  { id: 'ala', region: 'г. Алматы', lat: 43.24, lng: 76.89, risks: { fire: 30, flood: 38, weather: 56, hazmat: 36 }, drivers: { flood: 'Сели в предгорьях Заилийского Алатау' } },
  { id: 'shy', region: 'г. Шымкент', lat: 42.34, lng: 69.59, risks: { fire: 33, flood: 15, weather: 34, hazmat: 52 }, drivers: { hazmat: 'НПЗ, химическое производство' } },
];

export const DEMO_ALERTS: RiskAlert[] = [
  { id: 'a1', kind: 'fire', level: 'critical', region: 'Карагандинская обл.', title: 'Чрезвычайная пожарная опасность', text: 'Сочетание сухостоя, влажности < 20 % и ветра до 17 м/с. Рекомендуется усиление патрулирования и готовность техники для опашки.', horizon: '24–48 ч', tr: { kz: { title: 'Төтенше өрт қаупі', text: 'Құрғақ шөп, ылғалдылық < 20 % және 17 м/с-қа дейінгі жел. Патрульдеуді күшейту және жер жыртатын техниканы дайын ұстау ұсынылады.', region: 'Қарағанды облысы', horizon: '24–48 сағ' }, en: { title: 'Extreme fire danger', text: 'Dry grass, humidity < 20 % and wind up to 17 m/s. Stepped-up patrols and ploughing machinery on standby are recommended.', region: 'Karaganda Region', horizon: '24–48 h' } } },
  { id: 'a2', kind: 'fire', level: 'high', region: 'Улытауская, Костанайская обл.', title: 'Высокий риск степных пожаров', text: 'Засушливая осень, пожнивные остатки. Проверить минерализованные полосы вокруг населенных пунктов.', horizon: '72 ч', tr: { kz: { title: 'Дала өрттерінің жоғары қаупі', text: 'Құрғақ күз, егін қалдықтары. Елді мекендер айналасындағы минералданған жолақтарды тексеру.', region: 'Ұлытау, Қостанай облыстары', horizon: '72 сағ' }, en: { title: 'High risk of steppe fires', text: 'Dry autumn and crop residues. Check firebreaks around settlements.', region: 'Ulytau and Kostanay Regions', horizon: '72 h' } } },
  { id: 'a3', kind: 'weather', level: 'high', region: 'г. Астана, Карагандинская обл.', title: 'Штормовой ветер', text: 'Порывы до 20 м/с. Риск обрыва ЛЭП и падения конструкций; ограничения для автолестниц.', horizon: '12–24 ч', tr: { kz: { title: 'Дауылды жел', text: 'Екпіні 20 м/с-қа дейін. ЭБЖ үзілуі және конструкциялардың құлау қаупі; автосатыларға шектеулер.', region: 'Астана қ., Қарағанды облысы', horizon: '12–24 сағ' }, en: { title: 'Storm-force wind', text: 'Gusts up to 20 m/s. Risk of power line breaks and falling structures; restrictions for aerial ladders.', region: 'Astana, Karaganda Region', horizon: '12–24 h' } } },
  { id: 'a4', kind: 'hazmat', level: 'high', region: 'Атырауская обл.', title: 'Повышенный риск на опасных объектах', text: 'Плановые работы на установках с сероводородом при неблагоприятном ветре в сторону жилой зоны.', horizon: '48 ч', tr: { kz: { title: 'Қауіпті нысандардағы қауіптің артуы', text: 'Тұрғын аймаққа қолайсыз жел кезінде күкіртсутегі бар қондырғылардағы жоспарлы жұмыстар.', region: 'Атырау облысы', horizon: '48 сағ' }, en: { title: 'Elevated risk at hazardous facilities', text: 'Scheduled work on hydrogen-sulphide units while the wind blows towards housing.', region: 'Atyrau Region', horizon: '48 h' } } },
  { id: 'a5', kind: 'flood', level: 'medium', region: 'Алматинская, Жетысуская обл.', title: 'Селевая опасность', text: 'Ливни в предгорьях. Возможны локальные сели, контроль гидропостов.', horizon: '24 ч', tr: { kz: { title: 'Сел қаупі', text: 'Тау бөктеріндегі нөсер. Жергілікті селдер болуы мүмкін, гидробекеттерді бақылау.', region: 'Алматы, Жетісу облыстары', horizon: '24 сағ' }, en: { title: 'Mudflow danger', text: 'Downpours in the foothills. Local mudflows possible; monitor gauging stations.', region: 'Almaty and Zhetysu Regions', horizon: '24 h' } } },
];

/** Переводы факторов риска для DEMO (ключ — русский текст) */
export const DRIVER_TR: Record<string, { kz: string; en: string }> = {
  'Засушливая осень, низкая влажность': { kz: 'Құрғақ күз, төмен ылғалдылық', en: 'Dry autumn, low humidity' },
  'Лесостепь Бурабая, сухая погода': { kz: 'Бурабай орманды даласы, құрғақ ауа райы', en: 'Burabay forest-steppe, dry weather' },
  'Пожнивные остатки после уборки': { kz: 'Егін жинаудан кейінгі қалдықтар', en: 'Crop residues after harvest' },
  'Степные пожары в соседних районах': { kz: 'Көрші аудандардағы дала өрттері', en: 'Steppe fires in neighbouring districts' },
  'Сухая трава, пойменные камыши': { kz: 'Құрғақ шөп, жайылмадағы қамыс', en: 'Dry grass, floodplain reeds' },
  'Сухостой, ветер до 17 м/с, 6 термоточек за сутки': { kz: 'Қураған шөп, жел 17 м/с-қа дейін, тәулігіне 6 термонүкте', en: 'Dead vegetation, wind up to 17 m/s, 6 hotspots in 24 h' },
  'Попуски на Сырдарье': { kz: 'Сырдариядағы су жіберу', en: 'Water releases on the Syr Darya' },
  'Селевая опасность после ливней': { kz: 'Нөсерден кейінгі сел қаупі', en: 'Mudflow danger after downpours' },
  'Селевая опасность': { kz: 'Сел қаупі', en: 'Mudflow danger' },
  'Сели в предгорьях Заилийского Алатау': { kz: 'Іле Алатауы бөктеріндегі селдер', en: 'Mudflows in the Trans-Ili Alatau foothills' },
  'Металлургия, горнодобыча': { kz: 'Металлургия, тау-кен өндірісі', en: 'Metallurgy, mining' },
  'НПЗ, химическое производство': { kz: 'МӨЗ, химия өндірісі', en: 'Oil refinery, chemical production' },
  'Нефтегазовые объекты': { kz: 'Мұнай-газ нысандары', en: 'Oil and gas facilities' },
  'Нефтегазовые объекты, сероводород': { kz: 'Мұнай-газ нысандары, күкіртсутегі', en: 'Oil and gas facilities, hydrogen sulphide' },
  'Нефтехимия, ТЭЦ, хранение аммиака': { kz: 'Мұнай химиясы, ЖЭО, аммиак сақтау', en: 'Petrochemicals, power plant, ammonia storage' },
  'Цветная металлургия': { kz: 'Түсті металлургия', en: 'Non-ferrous metallurgy' },
  'Ливни в предгорьях': { kz: 'Тау бөктеріндегі нөсер', en: 'Downpours in the foothills' },
  'Порывистый ветер до 20 м/с': { kz: 'Екпінді жел 20 м/с-қа дейін', en: 'Gusty wind up to 20 m/s' },
  'Пыльные бури': { kz: 'Шаңды дауылдар', en: 'Dust storms' },
  'Ранние заморозки, горные районы': { kz: 'Ерте үсік, таулы аудандар', en: 'Early frosts, mountain areas' },
  'Штормовое предупреждение: ветер': { kz: 'Дауыл туралы ескерту: жел', en: 'Storm warning: wind' },
};
