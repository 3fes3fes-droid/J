import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const rawRoot = join(root, "data", "raw");
const publicDataRoot = join(root, "public", "data");

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const techniques = readJson(join(rawRoot, "techniques.json"));
const terms = readJson(join(rawRoot, "terms.json"));
const pages = readJson(join(publicDataRoot, "page-index.json"));
const comicEvidence = readJson(join(rawRoot, "comic-evidence.json"));

const compact = (value) => String(value || "")
  .normalize("NFKC")
  .toLocaleLowerCase("ja")
  .replace(/[\s・「」『』（）()【】〈〉《》―ー…!?！？。、,.\-／/]/g, "");
const unique = (values) => [...new Set(values.filter(Boolean))];

const techniqueChapterOverrides = new Map([
  ["朶頤光海", ["ch-102"]],
]);
const termChapterOverrides = new Map([
  ["フィジカルギフテッド", ["ch-073", "ch-074", "ch-149", "ch-150", "ch-198"]],
  ["京都府立呪術高等専門学校", ["ch-032", "ch-033", "ch-034"]],
  ["仮想怨霊", ["ch-073"]],
  ["呪力効率", ["ch-140"]],
  ["呪力総量", ["ch-140"]],
  ["必中必殺型領域", ["ch-164"]],
  ["懐玉・玉折", Array.from({ length: 15 }, (_, index) => `ch-${String(index + 65).padStart(3, "0")}`)],
  ["旧式領域", ["ch-164"]],
  ["特別一級術師", ["ch-138"]],
]);

// Pages checked against the manga itself. These entries take priority over OCR,
// because large display lettering and low-dialogue action pages are often missed
// or badly garbled by OCR even when the relevant technique is visually explicit.
const manualTechniqueScenes = new Map([
  ["十種影法術", [{ chapterId: "ch-001", volume: 1, page: 38 }]],
  ["玉犬", [{ chapterId: "ch-001", volume: 1, page: 38 }]],
  ["伏魔御廚子", [
    { chapterId: "ch-119", volume: 14, page: 71 },
    { chapterId: "ch-008", volume: 2, page: 19 },
  ]],
  ["大蛇", [{ chapterId: "ch-009", volume: 2, page: 37 }]],
  ["火礫蟲", [{ chapterId: "ch-014", volume: 2, page: 128 }]],
  ["蓋棺鉄囲山", [{ chapterId: "ch-015", volume: 2, page: 154 }]],
  ["無量空処", [{ chapterId: "ch-015", volume: 2, page: 160 }]],
  ["不知井底", [{ chapterId: "ch-017", volume: 3, page: 16 }]],
  ["逕庭拳", [{ chapterId: "ch-020", volume: 3, page: 74 }]],
  ["瓦落瓦落", [{ chapterId: "ch-023", volume: 3, page: 140 }]],
  ["自閉円頓裹", [{ chapterId: "ch-029", volume: 4, page: 88 }]],
  ["シン・陰流「抜刀」", [{ chapterId: "ch-035", volume: 5, page: 14 }]],
  ["不義遊戯", [{ chapterId: "ch-050", volume: 6, page: 139 }]],
  ["傀儡操術", [{ chapterId: "ch-038", volume: 5, page: 83 }]],
  ["激震掌（ドラミングビート）", [{ chapterId: "ch-039", volume: 5, page: 96 }]],
  ["付喪操術", [{ chapterId: "ch-040", volume: 5, page: 126 }]],
  ["簪", [{ chapterId: "ch-041", volume: 5, page: 143 }]],
  ["構築術式", [{ chapterId: "ch-042", volume: 5, page: 162 }]],
  ["赤鱗躍動", [{ chapterId: "ch-043", volume: 5, page: 179 }]],
  ["赤縛", [{ chapterId: "ch-044", volume: 6, page: 18 }]],
  ["満象", [{ chapterId: "ch-044", volume: 6, page: 16 }]],
  ["苅祓", [{ chapterId: "ch-045", volume: 6, page: 27 }]],
  ["呪いの種子", [{ chapterId: "ch-047", volume: 6, page: 73 }]],
  ["玉犬「渾」", [{ chapterId: "ch-058", volume: 7, page: 130 }]],
  ["蝕爛腐術", [{ chapterId: "ch-057", volume: 7, page: 94 }]],
  ["嵌合暗翳庭", [{ chapterId: "ch-058", volume: 7, page: 124 }]],
  ["翅王", [{ chapterId: "ch-059", volume: 7, page: 151 }]],
  ["分身を作る術式（名称不明）", [{ chapterId: "ch-068", volume: 8, page: 136 }]],
  ["釈魂刀", [{ chapterId: "ch-071", volume: 9, page: 25 }]],
  ["万里ノ鎖", [{ chapterId: "ch-075", volume: 9, page: 91 }]],
  ["装甲傀儡 究極メカ丸 試作0号", [{ chapterId: "ch-080", volume: 10, page: 13 }]],
  ["大祓砲", [{ chapterId: "ch-080", volume: 10, page: 19 }]],
  ["二重大祓砲", [{ chapterId: "ch-080", volume: 10, page: 23 }]],
  ["嘱託式の帳", [{ chapterId: "ch-083", volume: 10, page: 67 }]],
  ["領域展延", [{ chapterId: "ch-084", volume: 10, page: 97 }]],
  ["来訪瑞獣", [{ chapterId: "ch-095", volume: 11, page: 133 }]],
  ["霊亀", [{ chapterId: "ch-095", volume: 11, page: 133 }]],
  ["獬豸", [{ chapterId: "ch-095", volume: 11, page: 148 }]],
  ["術式順転「蒼」", [{ chapterId: "ch-052", volume: 6, page: 186 }]],
  ["術式反転「赫」", [{ chapterId: "ch-052", volume: 6, page: 186 }]],
  ["虚式「茈」", [{ chapterId: "ch-052", volume: 6, page: 188 }]],
  ["名称不明の領域（疱瘡婆）", [{ chapterId: "ch-101", volume: 12, page: 74 }]],
  ["穿血", [{ chapterId: "ch-101", volume: 12, page: 85 }]],
  ["血刃", [{ chapterId: "ch-105", volume: 12, page: 155 }]],
  ["八握剣異戒神将魔虚羅", [{ chapterId: "ch-118", volume: 14, page: 65 }]],
  ["退魔の剣", [{ chapterId: "ch-118", volume: 14, page: 53 }]],
  ["七海の鈍刀", [{ chapterId: "ch-120", volume: 14, page: 104 }]],
  ["多重魂", [{ chapterId: "ch-121", volume: 14, page: 112 }]],
  ["撥体", [{ chapterId: "ch-121", volume: 14, page: 112 }]],
  ["卍蹴り", [{ chapterId: "ch-121", volume: 14, page: 125 }]],
  ["名称不明の傷固定術式（新田新）", [{ chapterId: "ch-126", volume: 15, page: 39 }]],
  ["幾魂異性体", [{ chapterId: "ch-129", volume: 15, page: 95 }]],
  ["名称不明の空間移動術式（憂憂）", [{ chapterId: "ch-133", volume: 15, page: 189 }]],
  ["氷凝呪法", [{ chapterId: "ch-135", volume: 16, page: 36 }]],
  ["霜凪", [{ chapterId: "ch-135", volume: 16, page: 36 }]],
  ["鎌異断", [{ chapterId: "ch-135", volume: 16, page: 40 }]],
  ["直瀑", [{ chapterId: "ch-135", volume: 16, page: 42 }]],
  ["解", [{ chapterId: "ch-119", volume: 14, page: 69 }]],
  ["捌", [{ chapterId: "ch-119", volume: 14, page: 69 }]],
  ["竈「開」", [{ chapterId: "ch-119", volume: 14, page: 79 }]],
  ["グラニテブラスト", [{ chapterId: "ch-176", volume: 20, page: 96 }]],
  ["星間飛行", [{ chapterId: "ch-154", volume: 18, page: 39 }]],
  ["名称不明の扉による攻撃（秤金次）", [{ chapterId: "ch-155", volume: 18, page: 56 }]],
  ["処刑人の剣", [{ chapterId: "ch-166", volume: 19, page: 89 }]],
  ["再契象", [{ chapterId: "ch-168", volume: 19, page: 140 }]],
  ["黄櫨折の術式（名称不明）", [{ chapterId: "ch-168", volume: 19, page: 134 }]],
  ["彌虚葛籠", [{ chapterId: "ch-171", volume: 19, page: 191 }]],
  ["爛生刀", [{ chapterId: "ch-174", volume: 20, page: 65 }]],
  ["黒沐死の術式（名称不明）", [{ chapterId: "ch-174", volume: 20, page: 53 }]],
  ["呪力の放出", [{ chapterId: "ch-177", volume: 20, page: 115 }]],
  ["呪力放出", [{ chapterId: "ch-177", volume: 20, page: 115 }]],
  ["宇守羅彈", [{ chapterId: "ch-177", volume: 20, page: 119 }]],
  ["完全顕現「リカ」", [{ chapterId: "ch-178", volume: 20, page: 128 }]],
  ["模倣", [{ chapterId: "ch-178", volume: 20, page: 140 }]],
  ["G戦杖", [{ chapterId: "ch-182", volume: 21, page: 31 }]],
  ["坐殺博徒", [{ chapterId: "ch-182", volume: 21, page: 49 }]],
  ["坐殺博徒の大当たり状態", [{ chapterId: "ch-183", volume: 21, page: 52 }]],
  ["左腕を代償とする即席の縛り", [{ chapterId: "ch-190", volume: 21, page: 209 }]],
  ["時胞月宮殿", [{ chapterId: "ch-198", volume: 22, page: 147 }]],
  ["細胞単位の投射呪法", [{ chapterId: "ch-198", volume: 22, page: 153 }]],
  ["反重力機構", [{ chapterId: "ch-204", volume: 23, page: 98 }]],
  ["星の怒り", [{ chapterId: "ch-205", volume: 23, page: 118 }]],
  ["凰輪", [{ chapterId: "ch-205", volume: 23, page: 111 }]],
  ["胎蔵遍野", [{ chapterId: "ch-205", volume: 23, page: 124 }]],
  ["ブラックホール化", [{ chapterId: "ch-208", volume: 23, page: 181 }]],
  ["円鹿", [{ chapterId: "ch-218", volume: 25, page: 14 }]],
  ["液体金属", [{ chapterId: "ch-218", volume: 25, page: 12 }]],
  ["虫の鎧", [{ chapterId: "ch-218", volume: 25, page: 9 }]],
  ["貫牛", [{ chapterId: "ch-218", volume: 25, page: 18 }]],
  ["誅伏賜死", [{ chapterId: "ch-164", volume: 19, page: 48 }]],
  ["没収", [{ chapterId: "ch-164", volume: 19, page: 61 }]],
  ["三重疾苦", [{ chapterId: "ch-219", volume: 25, page: 38 }]],
  ["真球", [{ chapterId: "ch-219", volume: 25, page: 42 }]],
  ["屠坐魔", [{ chapterId: "ch-006", volume: 1, page: 165 }]],
  ["十劃呪法", [{ chapterId: "ch-022", volume: 3, page: 114 }]],
  ["朶頤光海", [{ chapterId: "ch-051", volume: 6, page: 170 }]],
  ["共鳴り", [{ chapterId: "ch-061", volume: 7, page: 176 }]],
  ["あべこべ", [{ chapterId: "ch-096", volume: 11, page: 167 }]],
  ["200％虚式「茈」", [{ chapterId: "ch-223", volume: 25, page: 118 }]],
  ["単独禁区", [{ chapterId: "ch-223", volume: 25, page: 117 }]],
  ["楽巌寺の音楽術式（名称不明）", [{ chapterId: "ch-223", volume: 25, page: 110 }]],
  ["嵌合獣「顎吐」", [{ chapterId: "ch-233", volume: 26, page: 119 }]],
  ["嵌合獣 顎吐", [{ chapterId: "ch-233", volume: 26, page: 119 }]],
  ["世界を断つ斬撃", [{ chapterId: "ch-236", volume: 26, page: 184 }]],
  ["幻獣琥珀", [{ chapterId: "ch-237", volume: 27, page: 18 }]],
  ["神武解", [{ chapterId: "ch-237", volume: 27, page: 12 }]],
  ["不義遊戯 改", [{ chapterId: "ch-260", volume: 29, page: 111 }]],
  ["共振器式不義遊戯", [{ chapterId: "ch-260", volume: 29, page: 111 }]],
  ["ドゥルヴ・ラクダワラの術式（名称不明）", [{ chapterId: "ch-250", volume: 28, page: 93 }]],
  ["式神の軌跡を領域にする術式", [{ chapterId: "ch-250", volume: 28, page: 93 }]],
  ["六眼", [{ chapterId: "ch-071", volume: 9, page: 7 }]],
  ["反転術式", [{ chapterId: "ch-074", volume: 9, page: 77 }]],
  ["奇跡", [{ chapterId: "ch-100", volume: 12, page: 56 }]],
  ["心身掌握", [{ chapterId: "ch-255", volume: 29, page: 16 }]],
  ["投射呪法", [{ chapterId: "ch-140", volume: 16, page: 141 }]],
  ["朽", [{ chapterId: "ch-061", volume: 7, page: 177 }]],
  ["植物を操る術式", [{ chapterId: "ch-049", volume: 6, page: 123 }]],
  ["極ノ番「隕」", [{ chapterId: "ch-115", volume: 13, page: 184 }]],
  ["楽巌寺の音楽術式", [{ chapterId: "ch-223", volume: 25, page: 110 }]],
  ["死累累湧軍", [{ chapterId: "ch-108", volume: 13, page: 36 }]],
  ["水と海洋生物の術式", [{ chapterId: "ch-108", volume: 13, page: 36 }]],
  ["火山を操る術式", [{ chapterId: "ch-085", volume: 10, page: 124 }]],
  ["烏鷺亨子の術式（名称不明）", [{ chapterId: "ch-175", volume: 20, page: 74 }]],
  ["焦眉之赳", [{ chapterId: "ch-149", volume: 17, page: 143 }]],
  ["焼き切れた術式の反転術式修復", [{ chapterId: "ch-227", volume: 25, page: 198 }]],
  ["百斂", [{ chapterId: "ch-104", volume: 12, page: 137 }]],
  ["真贋相愛", [{ chapterId: "ch-249", volume: 28, page: 84 }]],
  ["祈祷の歌", [{ chapterId: "ch-255", volume: 29, page: 17 }]],
  ["神風", [{ chapterId: "ch-102", volume: 12, page: 105 }]],
  ["空を操る術式", [{ chapterId: "ch-175", volume: 20, page: 74 }]],
  ["竜", [{ chapterId: "ch-097", volume: 11, page: 171 }]],
  ["龍", [{ chapterId: "ch-097", volume: 11, page: 171 }]],
  ["竜骨", [{ chapterId: "ch-148", volume: 17, page: 124 }]],
  ["羽場の術式（名称不明）", [{ chapterId: "ch-161", volume: 18, page: 172 }]],
  ["羽生の術式（名称不明）", [{ chapterId: "ch-161", volume: 18, page: 168 }]],
  ["麗美の術式（名称不明）", [{ chapterId: "ch-161", volume: 18, page: 184 }]],
  ["肉体を渡る術式", [{ chapterId: "ch-269", volume: 30, page: 119 }]],
  ["自身の魂を呪物化する技術", [{ chapterId: "ch-212", volume: 24, page: 78 }]],
  ["落花の情", [{ chapterId: "ch-108", volume: 13, page: 31 }]],
  ["蕩蘊平線", [{ chapterId: "ch-108", volume: 13, page: 31 }]],
  ["虎杖の御厨子", [{ chapterId: "ch-257", volume: 29, page: 57 }]],
  ["虎杖悠仁の領域", [{ chapterId: "ch-264", volume: 30, page: 23 }]],
  ["蜘蛛の糸", [{ chapterId: "ch-215", volume: 24, page: 145 }]],
  ["血星磊", [{ chapterId: "ch-104", volume: 12, page: 137 }]],
  ["術式の消滅", [{ chapterId: "ch-221", volume: 25, page: 73 }]],
  ["赤鱗躍動・載", [{ chapterId: "ch-104", volume: 12, page: 144 }]],
  ["超人", [{ chapterId: "ch-240", volume: 27, page: 78 }]],
  ["追尾弾～五重奏～", [{ chapterId: "ch-081", volume: 10, page: 37 }]],
  ["邪去侮の梯子", [{ chapterId: "ch-213", volume: 24, page: 102 }]],
  ["電気の呪力特性", [{ chapterId: "ch-184", volume: 21, page: 79 }]],
  ["魂の境界を狙う解", [{ chapterId: "ch-264", volume: 30, page: 17 }]],
  ["鵺", [{ chapterId: "ch-007", volume: 1, page: 189 }]],
  ["麒麟", [{ chapterId: "ch-257", volume: 29, page: 56 }]],
  ["黒鳥操術", [{ chapterId: "ch-086", volume: 10, page: 130 }]],
  ["脱兎", [{ chapterId: "ch-096", volume: 11, page: 168 }]],
  ["超新星", [{ chapterId: "ch-103", volume: 12, page: 118 }]],
]);

// Terms use a page that visibly explains the concept or shows the event itself.
// They are checked separately from OCR so generic words such as "領域" never
// point to an arbitrary dialogue page merely because the word happened to occur.
const manualTermScenes = new Map([
  ["あらゆる事象への適応", [{ chapterId: "ch-119", volume: 14, page: 69 }]],
  ["コガネ", [{ chapterId: "ch-146", volume: 17, page: 67 }]],
  ["パンダの三つの核", [{ chapterId: "ch-185", volume: 21, page: 93 }]],
  ["パンダ活動停止", [{ chapterId: "ch-271", volume: 30, page: 152 }]],
  ["フィジカルギフテッド", [{ chapterId: "ch-073", volume: 9, page: 64 }]],
  ["ブラックホール", [{ chapterId: "ch-208", volume: 23, page: 181 }]],
  ["一級術師推薦", [{ chapterId: "ch-063", volume: 8, page: 47 }]],
  ["三者同時の領域展開", [{ chapterId: "ch-179", volume: 20, page: 147 }]],
  ["世界を断つ斬撃の成立", [{ chapterId: "ch-236", volume: 26, page: 184 }]],
  ["両面宿儺の指", [{ chapterId: "ch-001", volume: 1, page: 45 }]],
  ["五条家", [{ chapterId: "ch-117", volume: 14, page: 32 }]],
  ["仙台結界の四つ巴", [{ chapterId: "ch-174", volume: 20, page: 53 }]],
  ["仮想怨霊", [{ chapterId: "ch-073", volume: 9, page: 57 }]],
  ["仮想質量", [{ chapterId: "ch-205", volume: 23, page: 118 }]],
  ["伏黒恵への受肉", [{ chapterId: "ch-213", volume: 24, page: 90 }]],
  ["元星漿体", [{ chapterId: "ch-202", volume: 23, page: 47 }]],
  ["入れ替え修行", [{ chapterId: "ch-258", volume: 29, page: 72 }]],
  ["六眼", [{ chapterId: "ch-071", volume: 9, page: 7 }]],
  ["加茂家", [{ chapterId: "ch-043", volume: 5, page: 179 }]],
  ["千年前の術師との縛り", [{ chapterId: "ch-136", volume: 16, page: 49 }]],
  ["南十字座の星順", [{ chapterId: "ch-156", volume: 18, page: 81 }]],
  ["受肉型の術師", [{ chapterId: "ch-136", volume: 16, page: 49 }]],
  ["受肉術師と器の抑圧", [{ chapterId: "ch-213", volume: 24, page: 99 }]],
  ["呪力", [{ chapterId: "ch-012", volume: 2, page: 97 }]],
  ["呪力からの脱却", [{ chapterId: "ch-136", volume: 16, page: 49 }]],
  ["呪力の最適化", [{ chapterId: "ch-136", volume: 16, page: 50 }]],
  ["呪力の電荷", [{ chapterId: "ch-184", volume: 21, page: 79 }]],
  ["呪力ゼロ", [{ chapterId: "ch-073", volume: 9, page: 64 }]],
  ["呪力ゼロと領域の対象外", [{ chapterId: "ch-198", volume: 22, page: 147 }]],
  ["呪力出力", [{ chapterId: "ch-177", volume: 20, page: 115 }]],
  ["呪力効率", [{ chapterId: "ch-140", volume: 16, page: 133 }]],
  ["呪力特性", [{ chapterId: "ch-184", volume: 21, page: 79 }]],
  ["呪力総量", [{ chapterId: "ch-140", volume: 16, page: 133 }]],
  ["呪物", [{ chapterId: "ch-001", volume: 1, page: 45 }]],
  ["呪縛", [{ chapterId: "ch-212", volume: 24, page: 76 }]],
  ["呪胎九相図", [{ chapterId: "ch-060", volume: 7, page: 168 }]],
  ["呪術における双子", [{ chapterId: "ch-149", volume: 17, page: 138 }]],
  ["呪詛師", [{ chapterId: "ch-096", volume: 11, page: 161 }]],
  ["呪骸", [{ chapterId: "ch-185", volume: 21, page: 93 }]],
  ["嘱託式の帳", [{ chapterId: "ch-083", volume: 10, page: 67 }]],
  ["器", [{ chapterId: "ch-001", volume: 1, page: 46 }]],
  ["坐殺博徒の4分11秒", [{ chapterId: "ch-183", volume: 21, page: 52 }]],
  ["堕天", [{ chapterId: "ch-213", volume: 24, page: 99 }]],
  ["外国軍侵入", [{ chapterId: "ch-209", volume: 24, page: 7 }]],
  ["天元と人類の同化", [{ chapterId: "ch-202", volume: 23, page: 50 }]],
  ["天元の同化", [{ chapterId: "ch-065", volume: 8, page: 72 }]],
  ["天与呪縛", [{ chapterId: "ch-073", volume: 9, page: 64 }]],
  ["天逆鉾", [{ chapterId: "ch-145", volume: 17, page: 63 }]],
  ["契闊", [{ chapterId: "ch-212", volume: 24, page: 76 }]],
  ["完全受肉", [{ chapterId: "ch-238", volume: 27, page: 28 }]],
  ["完全自立型人工知能呪骸", [{ chapterId: "ch-147", volume: 17, page: 89 }]],
  ["完全顕現の五分間", [{ chapterId: "ch-178", volume: 20, page: 128 }]],
  ["宿儺の消滅", [{ chapterId: "ch-268", volume: 30, page: 97 }]],
  ["宿儺最後の指", [{ chapterId: "ch-271", volume: 30, page: 169 }]],
  ["対領域技術", [{ chapterId: "ch-171", volume: 19, page: 191 }]],
  ["帳", [{ chapterId: "ch-083", volume: 10, page: 67 }]],
  ["式神", [{ chapterId: "ch-001", volume: 1, page: 38 }]],
  ["彌虚葛籠", [{ chapterId: "ch-171", volume: 19, page: 191 }]],
  ["影", [{ chapterId: "ch-172", volume: 20, page: 7 }]],
  ["御三家", [{ chapterId: "ch-117", volume: 14, page: 32 }]],
  ["必中効果", [{ chapterId: "ch-108", volume: 13, page: 31 }]],
  ["必中必殺型領域", [{ chapterId: "ch-164", volume: 19, page: 48 }]],
  ["怨霊", [{ chapterId: "ch-191", volume: 22, page: 16 }]],
  ["拡張術式", [{ chapterId: "ch-052", volume: 6, page: 186 }]],
  ["新陰流当主の縛り", [{ chapterId: "ch-269", volume: 30, page: 121 }]],
  ["旧式領域", [{ chapterId: "ch-164", volume: 19, page: 48 }]],
  ["星漿体", [{ chapterId: "ch-065", volume: 8, page: 72 }]],
  ["正のエネルギー", [{ chapterId: "ch-118", volume: 14, page: 53 }]],
  ["死刑", [{ chapterId: "ch-166", volume: 19, page: 89 }]],
  ["死滅回游の慣らし", [{ chapterId: "ch-209", volume: 24, page: 18 }]],
  ["死滅回游終了条件の追加", [{ chapterId: "ch-220", volume: 25, page: 53 }]],
  ["毒", [{ chapterId: "ch-061", volume: 7, page: 177 }]],
  ["没収と呪具", [{ chapterId: "ch-245", volume: 27, page: 181 }]],
  ["浴", [{ chapterId: "ch-216", volume: 24, page: 157 }]],
  ["浴による魂の沈下", [{ chapterId: "ch-216", volume: 24, page: 159 }]],
  ["游雲", [{ chapterId: "ch-051", volume: 6, page: 165 }]],
  ["炳", [{ chapterId: "ch-150", volume: 17, page: 153 }]],
  ["物の魂", [{ chapterId: "ch-196", volume: 22, page: 111 }]],
  ["特級", [{ chapterId: "ch-076", volume: 9, page: 117 }]],
  ["特級呪物", [{ chapterId: "ch-001", volume: 1, page: 45 }]],
  ["特級呪霊", [{ chapterId: "ch-174", volume: 20, page: 53 }]],
  ["獄門疆", [{ chapterId: "ch-090", volume: 11, page: 34 }]],
  ["獄門疆の封印条件", [{ chapterId: "ch-090", volume: 11, page: 35 }]],
  ["生得術式", [{ chapterId: "ch-133", volume: 15, page: 191 }]],
  ["生得領域", [{ chapterId: "ch-010", volume: 2, page: 63 }]],
  ["相撲の簡易領域", [{ chapterId: "ch-196", volume: 22, page: 107 }]],
  ["禪院家", [{ chapterId: "ch-148", volume: 17, page: 107 }]],
  ["禪院家の忌庫", [{ chapterId: "ch-148", volume: 17, page: 110 }]],
  ["突然変異呪骸", [{ chapterId: "ch-038", volume: 5, page: 83 }]],
  ["等級", [{ chapterId: "ch-006", volume: 1, page: 165 }]],
  ["結界を閉じない領域", [{ chapterId: "ch-119", volume: 14, page: 71 }]],
  ["結界侵入時の無作為転送", [{ chapterId: "ch-161", volume: 18, page: 167 }]],
  ["結界術", [{ chapterId: "ch-258", volume: 29, page: 68 }]],
  ["総則10（得点移動）", [{ chapterId: "ch-167", volume: 19, page: 107 }]],
  ["縛り", [{ chapterId: "ch-212", volume: 24, page: 76 }]],
  ["罪悪感", [{ chapterId: "ch-166", volume: 19, page: 89 }]],
  ["落花の情", [{ chapterId: "ch-226", volume: 25, page: 179 }]],
  ["虎杖の血統・単行本訂正", [{ chapterId: "ch-257", volume: 29, page: 48 }]],
  ["術師殺し", [{ chapterId: "ch-073", volume: 9, page: 64 }]],
  ["術式の常時自動化", [{ chapterId: "ch-076", volume: 9, page: 115 }]],
  ["術式の焼き切れ", [{ chapterId: "ch-227", volume: 25, page: 198 }]],
  ["術式の開示", [{ chapterId: "ch-050", volume: 6, page: 139 }]],
  ["術式剥奪", [{ chapterId: "ch-146", volume: 17, page: 72 }]],
  ["術式消滅", [{ chapterId: "ch-213", volume: 24, page: 102 }]],
  ["術式順転", [{ chapterId: "ch-052", volume: 6, page: 186 }]],
  ["覚醒型の術師", [{ chapterId: "ch-136", volume: 16, page: 50 }]],
  ["解呪", [{ chapterId: "zero-04", volume: 0, page: 194 }]],
  ["訓練・懲罰部屋", [{ chapterId: "ch-149", volume: 17, page: 140 }]],
  ["調伏の儀", [{ chapterId: "ch-117", volume: 14, page: 37 }]],
  ["躯倶留隊", [{ chapterId: "ch-150", volume: 17, page: 153 }]],
  ["逕庭拳", [{ chapterId: "ch-020", volume: 3, page: 74 }]],
  ["釈魂刀", [{ chapterId: "ch-252", volume: 28, page: 141 }]],
  ["閉じない領域", [{ chapterId: "ch-119", volume: 14, page: 71 }]],
  ["非必殺型領域", [{ chapterId: "ch-164", volume: 19, page: 48 }]],
  ["非術師", [{ chapterId: "ch-076", volume: 9, page: 108 }]],
  ["非術式死による怨霊化", [{ chapterId: "ch-192", volume: 22, page: 30 }]],
  ["領域", [{ chapterId: "ch-015", volume: 2, page: 160 }]],
  ["領域の押し合い", [{ chapterId: "ch-108", volume: 13, page: 31 }]],
  ["領域展延", [{ chapterId: "ch-084", volume: 10, page: 97 }]],
  ["高専内通者", [{ chapterId: "ch-079", volume: 9, page: 180 }]],
  ["魂の境界", [{ chapterId: "ch-264", volume: 30, page: 17 }]],
  ["黒縄", [{ chapterId: "ch-145", volume: 17, page: 63 }]],
]);

const normalizedPages = pages.map((page) => ({ ...page, compactText: compact(page.text) }));
const pageByLocator = new Map(normalizedPages.map((page) => [`${page.volume}:${page.page}`, page]));
const chapterRanges = new Map(Object.entries(comicEvidence.chapters)
  .map(([chapterId, evidence]) => [chapterId, evidence.pageRange]));
const pagesByChapter = new Map();
for (const page of normalizedPages) {
  if (!page.chapterId) continue;
  const range = chapterRanges.get(page.chapterId);
  if (range && (page.page < range.start || page.page > range.end)) continue;
  if (!pagesByChapter.has(page.chapterId)) pagesByChapter.set(page.chapterId, []);
  pagesByChapter.get(page.chapterId).push(page);
}

const grams = (value, size) => {
  const text = compact(value);
  const result = [];
  for (let index = 0; index <= text.length - size; index += 1) result.push(text.slice(index, index + size));
  return unique(result);
};

const genericContextWords = new Set([
  "術式", "呪力", "領域", "攻撃", "効果", "能力", "相手", "対象", "使用", "発動", "状態", "自身", "呪術", "呪霊",
  "戦闘", "可能", "付与", "展開", "必中", "結界", "肉体", "出力", "変化", "操作", "高専", "術師", "作中",
]);
const frequencyMemo = new Map();
const pageFrequency = (needle) => {
  if (!frequencyMemo.has(needle)) {
    frequencyMemo.set(needle, normalizedPages.reduce((total, page) => total + (page.compactText.includes(needle) ? 1 : 0), 0));
  }
  return frequencyMemo.get(needle);
};
const lexicalWords = (value) => unique(String(value || "")
  .normalize("NFKC")
  .match(/[\p{Script=Han}々〆ヶ]{2,}|[\p{Script=Katakana}ー]{3,}|[A-Za-z0-9％%]{3,}/gu) || [])
  .map(compact);

const contextNeedles = (record, kind) => {
  const value = kind === "technique" ? record.description : record.definition;
  const labels = labelNeedles(record, kind);
  const words = lexicalWords(value).filter((word) => word.length >= 2
    && !genericContextWords.has(word)
    && !labels.some((label) => label === word));

  const candidates = words.flatMap((word) => {
    const exactFrequency = pageFrequency(word);
    const exact = exactFrequency > 0 ? [{
      gram: word,
      word,
      size: word.length,
      frequency: exactFrequency,
      exactWord: true,
      weight: Math.log((normalizedPages.length + 1) / (exactFrequency + 1)) * Math.min(3.2, 1 + word.length * 0.28),
    }] : [];
    const partials = word.length >= 5
      ? grams(word, 3).map((gram) => {
        const frequency = pageFrequency(gram);
        return {
          gram,
          word,
          size: 3,
          frequency,
          exactWord: false,
          weight: frequency ? Math.log((normalizedPages.length + 1) / (frequency + 1)) * 0.8 : 0,
        };
      }).filter((item) => item.frequency > 0 && item.frequency <= 220)
      : [];
    return [...exact, ...partials];
  }).sort((left, right) => right.weight - left.weight || right.size - left.size);

  return candidates.slice(0, 30);
};

const levenshtein = (left, right) => {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
};

const bestApproximateMatch = (text, needle) => {
  if (!text || !needle || needle.length < 4) return { similarity: 0, excerpt: "" };
  if (text.includes(needle)) return { similarity: 1, excerpt: needle };

  const needleBigrams = grams(needle, 2);
  const sharedBigrams = needleBigrams.filter((gram) => text.includes(gram));
  if (!sharedBigrams.length) return { similarity: 0, excerpt: "" };

  const minimumLength = Math.max(2, needle.length - 1);
  const maximumLength = needle.length + 1;
  let best = { similarity: 0, excerpt: "" };
  for (let size = minimumLength; size <= maximumLength; size += 1) {
    for (let index = 0; index <= text.length - size; index += 1) {
      const excerpt = text.slice(index, index + size);
      if (!sharedBigrams.some((gram) => excerpt.includes(gram))) continue;
      const distance = levenshtein(needle, excerpt);
      const similarity = 1 - distance / Math.max(needle.length, excerpt.length);
      if (similarity > best.similarity) best = { similarity, excerpt };
      if (similarity >= 0.9) return best;
    }
  }
  return best;
};

const labelNeedles = (record, kind) => unique([
  record.name,
  ...(kind === "technique" ? record.aliases || [] : []),
  ...((kind === "technique"
    && compact(record.reading).length >= 2
    && (compact(record.reading).length >= 4 || pageFrequency(compact(record.reading)) <= 20))
    ? [record.reading]
    : []),
].map(compact)).filter((needle) => needle.length >= 2);

const scorePage = (record, page, kind, hasRelatedChapters, contextQueries, globalLabelSearch = false) => {
  const text = page.compactText;
  let best = null;
  for (const needle of labelNeedles(record, kind)) {
    if (globalLabelSearch && needle.length < 4) continue;
    if (text.includes(needle)) {
      const candidate = {
        score: 1000 + needle.length * 25,
        matchKind: "exact-label",
        matchedText: needle,
        similarity: 1,
      };
      if (!best || candidate.score > best.score) best = candidate;
      continue;
    }
    if (globalLabelSearch) continue;
    const approximate = bestApproximateMatch(text, needle);
    const threshold = needle.length >= 8 ? 0.7 : needle.length >= 5 ? 0.75 : 0.8;
    if (approximate.similarity < threshold) continue;
    const candidate = {
      score: Math.round(500 + approximate.similarity * 300 + needle.length * 14),
      matchKind: "fuzzy-label",
      matchedText: approximate.excerpt,
      similarity: Number(approximate.similarity.toFixed(3)),
    };
    if (!best || candidate.score > best.score) best = candidate;
  }
  if (!best && hasRelatedChapters) {
    const contextMatches = contextQueries.filter(({ gram }) => text.includes(gram));
    const exactWordMatches = contextMatches.filter(({ exactWord }) => exactWord);
    const partialMatchesByWord = new Map();
    for (const match of contextMatches.filter(({ exactWord }) => !exactWord)) {
      if (!partialMatchesByWord.has(match.word)) partialMatchesByWord.set(match.word, []);
      partialMatchesByWord.get(match.word).push(match);
    }
    const coherentPartialMatches = [...partialMatchesByWord.values()].filter((items) => items.length >= 2).flat();
    const contextScore = contextMatches.reduce((total, item) => total + item.weight, 0);
    const rareLongWord = exactWordMatches.some((item) => item.size >= 4 && item.frequency <= 100);
    const strongEnough = rareLongWord
      || exactWordMatches.length >= 2
      || (exactWordMatches.length >= 1 && coherentPartialMatches.length >= 2)
      || coherentPartialMatches.length >= 4;
    const contextThreshold = 8.5;
    if (strongEnough && contextScore >= contextThreshold) {
      best = {
        score: Math.round(100 + contextScore * 12),
        matchKind: "context-text",
        matchedText: unique([...exactWordMatches, ...coherentPartialMatches].map((item) => item.gram)).slice(0, 5).join("・"),
        similarity: null,
      };
    }
  }
  return best;
};

const buildEvidence = (record, kind) => {
  const overrides = kind === "technique" ? techniqueChapterOverrides : termChapterOverrides;
  const chapterIds = unique([
    ...(record.chapterIds || []),
    ...(overrides.get(record.name) || []),
    ...((kind === "technique" ? record.activationStarts : []) || []).map((item) => item.chapterId),
    ...((kind === "technique" ? record.activationAttempts : []) || []).map((item) => item.chapterId),
  ]);
  const candidatePages = chapterIds.flatMap((chapterId) => pagesByChapter.get(chapterId) || []);
  const contextQueries = contextNeedles(record, kind);
  let matches = candidatePages.flatMap((page) => {
    const match = scorePage(record, page, kind, chapterIds.length > 0, contextQueries);
    return match ? [{
      chapterId: page.chapterId,
      volume: page.volume,
      page: page.page,
      src: `/media/pages/${String(page.volume).padStart(2, "0")}/${page.file}`,
      ...match,
    }] : [];
  });
  if (!matches.length) {
    const storyPages = [...pagesByChapter.values()].flat();
    matches = storyPages.flatMap((page) => {
      const match = scorePage(record, page, kind, false, [], true);
      return match ? [{
        chapterId: page.chapterId,
        volume: page.volume,
        page: page.page,
        src: `/media/pages/${String(page.volume).padStart(2, "0")}/${page.file}`,
        ...match,
      }] : [];
    });
  }
  matches.sort((left, right) => right.score - left.score || left.volume - right.volume || left.page - right.page);

  const manualScenes = kind === "technique"
    ? manualTechniqueScenes.get(record.name) || []
    : manualTermScenes.get(record.name) || [];
  const selected = manualScenes.map((scene) => {
    const indexed = pageByLocator.get(`${scene.volume}:${scene.page}`);
    const range = chapterRanges.get(scene.chapterId);
    if (!indexed || indexed.chapterId !== scene.chapterId || !range || scene.page < range.start || scene.page > range.end) {
      throw new Error(`Invalid manual scene for ${record.name}: ${scene.chapterId} ${scene.volume}-${scene.page}`);
    }
    return {
      ...scene,
      src: `/media/pages/${String(scene.volume).padStart(2, "0")}/${indexed.file}`,
      score: 2000,
      matchKind: "visual-confirmed",
      matchedText: "",
      similarity: null,
    };
  });
  const usedChapters = new Set();
  const usedPages = new Set(selected.map((scene) => `${scene.volume}:${scene.page}`));
  for (const scene of selected) usedChapters.add(scene.chapterId);
  for (const match of matches) {
    if (usedPages.has(`${match.volume}:${match.page}`)) continue;
    if (usedChapters.has(match.chapterId) && selected.length < Math.min(2, matches.length + manualScenes.length)) continue;
    selected.push(match);
    usedChapters.add(match.chapterId);
    usedPages.add(`${match.volume}:${match.page}`);
    if (selected.length === 3) break;
  }
  return selected;
};

const evidence = {
  generatedFrom: "page-index.json",
  method: "OCR label match inside the entity's manga chapters; no unrelated-page fallback",
  techniques: Object.fromEntries(techniques.map((record) => [record.id, buildEvidence(record, "technique")])),
  terms: Object.fromEntries(terms.map((record) => [record.id, buildEvidence(record, "term")])),
};

writeFileSync(join(rawRoot, "entity-image-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);

const summarize = (group) => ({
  total: Object.keys(group).length,
  withImages: Object.values(group).filter((items) => items.length).length,
  exact: Object.values(group).filter((items) => items.some((item) => item.matchKind === "exact-label")).length,
  fuzzyOnly: Object.values(group).filter((items) => items.length && items.every((item) => item.matchKind === "fuzzy-label")).length,
  contextOnly: Object.values(group).filter((items) => items.length && items.every((item) => item.matchKind === "context-text")).length,
});

console.log(JSON.stringify({
  output: join(rawRoot, "entity-image-evidence.json"),
  techniques: summarize(evidence.techniques),
  terms: summarize(evidence.terms),
}, null, 2));
