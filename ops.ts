/** Демо-движки оперативной обстановки и отчетов (DEMO MODE / mock-режим backend). */
import type { DetailedAnalysis, MapObject, ReportDoc, ReportForm, SituationAnalysis } from '../contracts.js';
import { L, tx, type L3, type Lang } from '../i18n.js';

type SitL3 = { summary: L3; threatLevel: SituationAnalysis['threatLevel']; direction: L3; forces: L3; monitoring: boolean; factors: L3[] };
const SITUATION_MOCKS: Record<string, SitL3> = {
  'inc-001': {
    summary: L('В Карагандинской области зарегистрировано возгорание степной территории. С учетом скорости ветра 12 м/с существует риск распространения огня на северо-восток.',
      'Қарағанды облысында дала аумағының жануы тіркелді. Желдің 12 м/с жылдамдығын ескергенде, өрттің солтүстік-шығысқа таралу қаупі бар.',
      'A steppe fire has been reported in Karaganda Region. With a 12 m/s wind, there is a risk of the fire spreading to the north-east.'),
    threatLevel: 'high', direction: L('северо-восток', 'солтүстік-шығыс', 'north-east'), forces: L('2 пожарных расчета + БПЛА', '2 өрт сөндіру есебі + ҰҰА', '2 fire crews + drone'), monitoring: true,
    factors: [L('Сухая растительность, низкая влажность', 'Құрғақ өсімдік, төмен ылғалдылық', 'Dry vegetation, low humidity'), L('Устойчивый ЮЗ ветер 12 м/с', 'Тұрақты оңтүстік-батыс желі 12 м/с', 'Steady SW wind 12 m/s'), L('Населенный пункт в ≈ 11 км по направлению распространения', 'Таралу бағытында ≈ 11 км жерде елді мекен', 'Settlement ≈ 11 km in the direction of spread')],
  },
  'inc-002': {
    summary: L('Пожар в квартире на 3-м этаже жилого дома в г. Алматы локализован. Сохраняется задымление подъезда; необходим контроль вышележащих этажей.',
      'Алматы қаласындағы тұрғын үйдің 3-қабатындағы пәтердегі өрт оқшауланды. Кіреберістің түтіндеуі сақталуда; жоғарғы қабаттарды бақылау қажет.',
      'The apartment fire on the 3rd floor of a residential building in Almaty is contained. The stairwell remains smoke-logged; upper floors must be monitored.'),
    threatLevel: 'medium', direction: L('вверх по лестничной клетке', 'баспалдақ торы бойымен жоғары', 'up the stairwell'), forces: L('3 АЦ + автолестница, 2 звена ГДЗС', '3 АЦ + автосатыны, 2 ГТҚҚ буыны', '3 engines + aerial ladder, 2 BA teams'), monitoring: true,
    factors: [L('Задымление путей эвакуации', 'Эвакуация жолдарының түтінденуі', 'Smoke-logged escape routes'), L('Возможное скрытое горение в перекрытиях', 'Жабындардағы жасырын жану мүмкіндігі', 'Possible hidden burning in floor voids'), L('Жильцы на верхних этажах', 'Жоғарғы қабаттардағы тұрғындар', 'Residents on upper floors')],
  },
  'inc-003': {
    summary: L('В пойме р. Есиль продолжается подъем уровня воды (+38 см за сутки). При сохранении тенденции возможно подтопление еще 20–30 участков в течение 48 часов.',
      'Есіл өзенінің жайылмасында су деңгейі көтерілуде (тәулігіне +38 см). Үрдіс сақталса, 48 сағат ішінде тағы 20–30 учаскені су басуы мүмкін.',
      'The water level in the Yesil floodplain keeps rising (+38 cm per day). If the trend continues, 20–30 more plots may be flooded within 48 hours.'),
    threatLevel: 'high', direction: L('вниз по течению, северная часть поймы', 'ағыс бойымен төмен, жайылманың солтүстік бөлігі', 'downstream, northern floodplain'), forces: L('Насосная техника, 2 лодки, БПЛА для мониторинга', 'Сорғы техникасы, 2 қайық, бақылауға арналған ҰҰА', 'Pumps, 2 boats, monitoring drone'), monitoring: true,
    factors: [L('Интенсивное снеготаяние', 'Қарқынды қар еруі', 'Intensive snowmelt'), L('Прогноз осадков', 'Жауын-шашын болжамы', 'Precipitation forecast'), L('Низкие отметки жилой застройки', 'Тұрғын үйлердің төмен белгілері', 'Low-lying housing')],
  },
  'inc-004': {
    summary: L('ДТП на трассе Астана — Щучинск: требуется деблокирование одного пострадавшего. Риск вторичных столкновений на мокром покрытии.',
      'Астана — Щучинск трассасындағы ЖКО: бір зардап шеккенді бұғаттан шығару қажет. Дымқыл жабында қайталама соқтығысу қаупі бар.',
      'Road traffic collision on the Astana — Shchuchinsk highway: one casualty needs extrication. Risk of secondary collisions on the wet surface.'),
    threatLevel: 'medium', direction: L('—', '—', '—'), forces: L('АСА с гидроинструментом, АЦ, 2 бригады СМП', 'Гидроқұралы бар АҚК, АЦ, 2 ЖМК бригадасы', 'Rescue unit with hydraulic tools, engine, 2 ambulances'), monitoring: false,
    factors: [L('Мокрое покрытие', 'Дымқыл жабын', 'Wet road surface'), L('Интенсивный трафик', 'Қарқынды қозғалыс', 'Heavy traffic'), L('Возможна утечка топлива', 'Жанармайдың ағуы мүмкін', 'Possible fuel leak')],
  },
  'inc-005': {
    summary: L('Утечка аммиака в промзоне г. Павлодар (учебный сценарий). При западном ветре 5 м/с облако смещается на восток; жилая застройка вне расчетной зоны, но требуется контроль.',
      'Павлодар қаласының өнеркәсіп аймағында аммиак ағуы (оқу сценарийі). Батыс желі 5 м/с болғанда бұлт шығысқа ығысады; тұрғын үйлер есептік аймақтан тыс, бірақ бақылау қажет.',
      'Ammonia leak in the Pavlodar industrial zone (training scenario). With a 5 m/s westerly wind the plume drifts east; housing is outside the estimated zone but must be monitored.'),
    threatLevel: 'high', direction: L('восток', 'шығыс', 'east'), forces: L('Отделение РХБЗ, газоспасатели, 1 АЦ для постановки водяных завес', 'РХБҚ бөлімшесі, газ құтқарушылар, су перделеріне 1 АЦ', 'CBRN team, gas rescuers, 1 engine for water curtains'), monitoring: true,
    factors: [L('Токсичность аммиака', 'Аммиактың уыттылығы', 'Ammonia toxicity'), L('Направление ветра', 'Жел бағыты', 'Wind direction'), L('Персонал соседних предприятий', 'Көрші кәсіпорындардың персоналы', 'Staff of neighbouring facilities')],
  },
  'inc-006': {
    summary: L('Ледовый затор на р. Илек стабилен. Прямой угрозы населенным пунктам нет, рекомендовано продолжить наблюдение.',
      'Елек өзеніндегі мұз кептелісі тұрақты. Елді мекендерге тікелей қауіп жоқ, бақылауды жалғастыру ұсынылады.',
      'The ice jam on the Ilek River is stable. No direct threat to settlements; continued monitoring is recommended.'),
    threatLevel: 'low', direction: L('вниз по течению', 'ағыс бойымен төмен', 'downstream'), forces: L('Наблюдательный пост + БПЛА', 'Бақылау бекеті + ҰҰА', 'Observation post + drone'), monitoring: true,
    factors: [L('Возможен рост уровня при потеплении', 'Жылыну кезінде деңгей көтерілуі мүмкін', 'Level may rise with warmer weather')],
  },
  'inc-007': {
    summary: L('Низовой пожар в сосновом бору у г. Семей (учебные данные). При северо-западном ветре 9 м/с и влажности 22 % существует риск перехода в верховой пожар и выхода огня к дачному массиву (≈ 60 человек).',
      'Семей қ. маңындағы қарағайлы ормандағы төменгі өрт (оқу деректері). Солтүстік-батыс желі 9 м/с және ылғалдылық 22 % болғанда жоғарғы өртке ауысу және саяжай алқабына (≈ 60 адам) шығу қаупі бар.',
      'Surface fire in a pine forest near Semey (training data). With a 9 m/s north-westerly wind and 22 % humidity there is a risk of transition to a crown fire and of the fire reaching a dacha area (≈ 60 people).'),
    threatLevel: 'critical', direction: L('юго-восток, к дачному массиву', 'оңтүстік-шығыс, саяжай алқабына қарай', 'south-east, towards the dacha area'),
    forces: L('4 АЦ, водовоз, БПЛА, лесопожарная техника', '4 АЦ, су тасығыш, ҰҰА, орман өртіне қарсы техника', '4 engines, water tanker, drone, forest firefighting equipment'), monitoring: true,
    factors: [L('Риск верхового пожара', 'Жоғарғы өрт қаупі', 'Crown fire risk'), L('Дачный массив по ходу огня', 'Өрт жолындағы саяжай алқабы', 'Dacha area in the fire path'), L('Ограниченный подъезд для техники', 'Техниканың шектеулі кіре беруі', 'Limited vehicle access')],
  },
  'inc-008': {
    summary: L('Пожар на складе стройматериалов в г. Тараз (учебные данные): сильное задымление, персонал эвакуирован. Основной риск — распространение по сгораемым материалам и обрушение кровли.',
      'Тараз қ. құрылыс материалдары қоймасындағы өрт (оқу деректері): қатты түтін, персонал көшірілді. Негізгі қауіп — жанғыш материалдар бойынша таралу және шатырдың опырылуы.',
      'Fire in a building-materials warehouse in Taraz (training data): heavy smoke, staff evacuated. Main risks are spread through combustible stock and roof collapse.'),
    threatLevel: 'medium', direction: L('по складу, к соседним строениям', 'қойма бойынша, көрші ғимараттарға', 'through the warehouse towards adjacent buildings'),
    forces: L('3 АЦ, звенья ГДЗС', '3 АЦ, ГТҚҚ буындары', '3 engines, BA teams'), monitoring: true,
    factors: [L('Сгораемые материалы', 'Жанғыш материалдар', 'Combustible stock'), L('Сильное задымление', 'Қатты түтін', 'Heavy smoke'), L('Риск обрушения кровли', 'Шатырдың опырылу қаупі', 'Roof collapse risk')],
  },
  'inc-009': {
    summary: L('Сообщение о запахе газа в многоквартирном доме в г. Шымкент (учебные данные). Жильцы эвакуированы, газоснабжение отключено; требуется проверка загазованности до возвращения людей.',
      'Шымкент қ. көппәтерлі үйдегі газ иісі туралы хабарлама (оқу деректері). Тұрғындар көшірілді, газбен жабдықтау ажыратылды; адамдар қайтпас бұрын газдануды тексеру қажет.',
      'Report of a gas smell in an apartment block in Shymkent (training data). Residents evacuated and gas supply shut off; gas levels must be checked before people return.'),
    threatLevel: 'medium', direction: L('—', '—', '—'), forces: L('АСА, газовая служба, 1 АЦ в резерве', 'АҚК, газ қызметі, резервте 1 АЦ', 'Rescue unit, gas utility, 1 engine on standby'), monitoring: true,
    factors: [L('Риск взрыва газовоздушной смеси', 'Газ-ауа қоспасының жарылу қаупі', 'Risk of a gas-air explosion'), L('Жильцы вне дома', 'Тұрғындар үйден тыс', 'Residents outside'), L('Нужен газоанализ', 'Газ талдауы қажет', 'Gas monitoring needed')],
  },
  'inc-010': {
    summary: L('Съезд пассажирского автобуса в кювет у г. Кокшетау (учебные данные): 22 пассажира, 6 пострадавших. Приоритет — медицинская сортировка и эвакуация пострадавших, безопасность на трассе.',
      'Көкшетау қ. маңында жолаушылар автобусы арыққа түсті (оқу деректері): 22 жолаушы, 6 зардап шеккен. Басымдық — медициналық сұрыптау және зардап шеккендерді эвакуациялау, трассадағы қауіпсіздік.',
      'A passenger bus left the road into a ditch near Kokshetau (training data): 22 passengers, 6 casualties. Priorities are medical triage, casualty evacuation and highway safety.'),
    threatLevel: 'high', direction: L('—', '—', '—'), forces: L('АСА, 3 бригады СМП, полиция', 'АҚК, 3 ЖМК бригадасы, полиция', 'Rescue unit, 3 ambulances, police'), monitoring: false,
    factors: [L('Много пострадавших', 'Зардап шеккендер көп', 'Multiple casualties'), L('Возможны зажатые пассажиры', 'Қысылып қалған жолаушылар болуы мүмкін', 'Possible trapped passengers'), L('Движение по трассе', 'Трассадағы қозғалыс', 'Highway traffic')],
  },
};

export function situationEngine(incident: MapObject, lang: Lang = 'ru'): SituationAnalysis {
  const m = SITUATION_MOCKS[incident.id];
  const t = (v: L3) => tx(lang, v);
  if (m) return { incidentId: incident.id, summary: t(m.summary), threatLevel: m.threatLevel, direction: t(m.direction), forces: t(m.forces), monitoring: m.monitoring, factors: m.factors.map(t) };
  const title = incident.tr?.[lang]?.title ?? incident.title;
  const desc = incident.tr?.[lang]?.description ?? incident.description;
  return {
    incidentId: incident.id,
    summary: `${title}: ${desc}`,
    threatLevel: incident.threat ?? 'medium',
    direction: t(L('уточняется', 'нақтылануда', 'being clarified')), forces: t(L('по решению РТП', 'ӨСБ шешімі бойынша', "per incident commander's decision")), monitoring: true,
    factors: [t(L('Недостаточно данных — требуется разведка', 'Деректер жеткіліксіз — барлау қажет', 'Insufficient data — reconnaissance required'))],
  };
}

export function detailedEngine(incident: MapObject): DetailedAnalysis {
    if (incident.id === 'inc-001') {
      return {
        title: 'Подробный анализ: степной пожар, Бухар-Жырауский р-н',
        forecast: [
          { horizon: '+1 час', text: 'Продвижение кромки на 1,5–2,5 км к северо-востоку, площадь до 90 га.' },
          { horizon: '+3 часа', text: 'При сохранении ветра — выход к пастбищам и хозпостройкам в ≈ 6–8 км от н. п.' },
          { horizon: '+6 часов', text: 'Вечернее ослабление ветра снижает скорость распространения; окно для отсечки фронта.' },
        ],
        risks: [
          'Смена направления ветра и угроза окружения техники огнем',
          'Переход огня через грунтовую дорогу при порывах',
          'Задымление автодороги, снижение видимости',
        ],
        recommendations: [
          'Сосредоточить силы на правом фланге и фронте, отсечь направление к населенному пункту',
          'Проложить минерализованную полосу силами привлеченной техники',
          'Вести непрерывную разведку БПЛА с тепловизором, передавать контур каждые 30 минут',
          'Предупредить акимат и население о возможной угрозе',
          'Определить пути отхода личного состава и точки сбора',
        ],
      };
    }
    const base = SITUATION_MOCKS[incident.id];
    return {
      title: `Подробный анализ: ${incident.title}`,
      forecast: [
        { horizon: '+1 час', text: 'Развитие ситуации в пределах текущей зоны при сохранении введенных сил.' },
        { horizon: '+3 часа', text: base?.monitoring ? 'Необходима повторная оценка по данным мониторинга.' : 'Ожидается завершение основных работ.' },
      ],
      risks: base?.factors.map((f) => f.ru) ?? ['Недостаточно исходных данных'],
      recommendations: [
        'Продолжить разведку и уточнение обстановки',
        `Поддерживать группировку сил: ${base?.forces.ru ?? 'по решению РТП'}`,
        'Обеспечить безопасность личного состава и пути отхода',
        'Докладывать в ЦУКС об изменениях обстановки',
      ],
    };
}

export function reportEngine(form: ReportForm): ReportDoc {
    const d = new Date(`${form.date}T${form.time || '00:00'}`);
    const dateStr = isNaN(d.getTime())
      ? form.date
      : d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
    // Внутренний номер черновика прототипа — НЕ номер документа МЧС РК
    const num = `QA-DRAFT-${form.date.replace(/-/g, '').slice(2)}-${String(Math.floor(Math.random() * 900) + 100)}`;
    const victims = form.victims.trim() || 'сведения о пострадавших отсутствуют';
    const area = form.area.trim() || 'не установлена';
    return {
      number: num,
      createdAt: new Date().toLocaleString('ru-RU'),
      title: `о чрезвычайной ситуации (происшествии): ${form.type.toLowerCase()}`,
      sections: [
        {
          heading: '1. Общие сведения',
          paragraphs: [
            `${dateStr} в ${form.time} по адресу (месту): ${form.place} произошло происшествие, классифицированное как «${form.type}».`,
            `Площадь (масштаб) происшествия: ${area}.`,
          ],
        },
        {
          heading: '2. Последствия',
          paragraphs: [`Пострадавшие: ${victims}.`],
        },
        {
          heading: '3. Привлеченные силы и средства',
          paragraphs: [form.forces.trim() ? `К ликвидации привлечены: ${form.forces.trim()}.` : 'Сведения о привлеченных силах и средствах не указаны.'],
        },
        {
          heading: '4. Результат проведенных работ',
          paragraphs: [`${form.result.trim()}${/[.!]$/.test(form.result.trim()) ? '' : '.'}`],
        },
        {
          heading: '5. Выводы',
          paragraphs: [
            'Действия подразделений осуществлялись в соответствии с решениями руководителя ликвидации ЧС. Обстоятельства и причины происшествия подлежат дальнейшему установлению в установленном порядке.',
            'Материалы для анализа действий подразделений переданы в модуль «Анализ происшествий».',
          ],
        },
      ],
    };
}
