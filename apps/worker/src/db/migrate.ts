import type { Client } from '@libsql/client/web';

let migrated = false;

export async function ensureSchemaMigrated(db: Client): Promise<void> {
  if (migrated) return;
  try {
    await db.execute(
      `CREATE TABLE IF NOT EXISTS chapter_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        comic_id INTEGER NOT NULL,
        chapter_id INTEGER DEFAULT NULL,
        reason TEXT NOT NULL,
        detail TEXT DEFAULT '',
        status TEXT DEFAULT 'open',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (comic_id) REFERENCES comics(id) ON DELETE CASCADE
      )`
    );
    await db.execute(
      `CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT '',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    );
    await db.execute(
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        avatar_seed TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    );
    await db.execute(
      `CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        comic_id INTEGER NOT NULL,
        chapter_id INTEGER DEFAULT NULL,
        user_id INTEGER NOT NULL,
        parent_id INTEGER DEFAULT NULL,
        reply_to_name TEXT DEFAULT NULL,
        content TEXT NOT NULL DEFAULT '',
        meme_url TEXT DEFAULT NULL,
        likes_count INTEGER NOT NULL DEFAULT 0,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (comic_id) REFERENCES comics(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
      )`
    );
    await db.execute(
      `CREATE TABLE IF NOT EXISTS comment_likes (
        comment_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (comment_id, user_id),
        FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`
    );
    await db.execute(
      `CREATE TABLE IF NOT EXISTS user_bookmarks (
        user_id INTEGER NOT NULL,
        comic_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, comic_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (comic_id) REFERENCES comics(id) ON DELETE CASCADE
      )`
    );
    await db.execute(
      `CREATE TABLE IF NOT EXISTS user_history (
        user_id INTEGER NOT NULL,
        comic_id INTEGER NOT NULL,
        chapter_id INTEGER NOT NULL,
        chapter_number REAL NOT NULL,
        progress INTEGER DEFAULT 0,
        total_pages INTEGER DEFAULT 0,
        read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, comic_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (comic_id) REFERENCES comics(id) ON DELETE CASCADE,
        FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
      )`
    );
    await db.execute(
      `CREATE TABLE IF NOT EXISTS genres (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL UNIQUE,
        description TEXT DEFAULT '',
        comic_count INTEGER DEFAULT 0
      )`
    );
    await db.execute(
      `CREATE INDEX IF NOT EXISTS idx_comments_chapter ON comments(comic_id, chapter_id, parent_id, created_at DESC)`
    );

    try { await db.execute('ALTER TABLE comics ADD COLUMN is_featured INTEGER DEFAULT 0'); } catch {}
    try { await db.execute('ALTER TABLE comics ADD COLUMN is_hidden INTEGER DEFAULT 0'); } catch {}
    try { await db.execute('ALTER TABLE comics ADD COLUMN translator TEXT DEFAULT ""'); } catch {}
    try { await db.execute('ALTER TABLE comics ADD COLUMN likes_count INTEGER DEFAULT 0'); } catch {}
    try { await db.execute('ALTER TABLE genres ADD COLUMN description TEXT DEFAULT ""'); } catch {}
    try { await db.execute('ALTER TABLE genres ADD COLUMN comic_count INTEGER DEFAULT 0'); } catch {}

    await db.execute("INSERT OR IGNORE INTO site_settings (key, value) VALUES ('site_name', 'VinaHentai')");
    await db.execute("INSERT OR IGNORE INTO site_settings (key, value) VALUES ('announcement_enabled', '0')");
    await db.execute("INSERT OR IGNORE INTO site_settings (key, value) VALUES ('announcement_text', '')");
    await db.execute("INSERT OR IGNORE INTO site_settings (key, value) VALUES ('maintenance_mode', '0')");

        // Seed all VinaHentai genres with exact descriptions and comic counts
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('3d-hentai', '3D Hentai', 'Truyện tranh hoặc video hentai sử dụng đồ họa 3D.', 413)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('action-h-nh-ng', 'Action · Hành Động', '', 416)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('adult-ng-i-l-n', 'Adult · Người Lớn', '', 1346)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('adventure-phi-u-l-u', 'Adventure · Phiêu Lưu', 'Nhân vật bước vào hành trình phiêu lưu: thế giới fantasy, dị giới, hoặc vùng đất xa lạ. Nội dung kết hợp tình dục với yếu tố hành động, khám phá, và cốt truyện dài.', 214)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('ahegao', 'Ahegao', 'Biểu cảm nhân vật khi đạt cực khoái mãnh liệt: mắt đảo, lưỡi thè, mặt đỏ, nước dãi chảy ra. Thể hiện sự mất kiểm soát và khoái cảm tột độ.', 12837)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('ai-generated-t-o-b-i-ai', 'AI Generated · Tạo Bởi AI', 'Tác phẩm do AI tạo ra (nét vẽ, hình ảnh, truyện); nhấn mạnh phong cách, hiệu ứng và sự độc đáo của công cụ AI.', 220)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('anal-h-u-m-n', 'Anal · Hậu Môn', 'Quan hệ tình dục qua đường hậu môn.', 7944)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('angel-thi-n-th-n', 'Angel · Thiên Thần', '', 122)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('nh-ng', 'Ảnh động', '', 76)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('animal', 'Animal', '', 475)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('animal-girl-n-th-nh-n', 'Animal Girl · Nữ Thú Nhân', 'Nhân vật nữ mang đặc điểm động vật như tai, đuôi, móng vuốt (mèo, chó, cáo, thỏ...). Tính cách thường dễ thương hoặc hoang dã, gợi cảm theo kiểu "nửa người nửa thú".', 1792)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('o-d-i', 'Áo dài', '', 7)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('apron-t-p-d', 'Apron · Tạp Dề', 'Tạp dề không nội y. Nhân vật nữ chỉ mặc duy nhất chiếc tạp dề mỏng, thường là vợ đảm, mẹ kế hoặc cô gái phục vụ trong nhà – mang cảm giác "nguy hiểm trong an toàn".', 81)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('artist-cg-cg-h-a-s', 'Artist CG · CG Họa Sĩ', 'Bộ tranh vẽ minh họa (CG – computer graphic) từ các họa sĩ hentai nổi tiếng. Thường không có cốt truyện rõ, chủ yếu là các cảnh sex chất lượng cao và tạo hình đẹp.', 742)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('aunt-d', 'Aunt · Dì', 'Quan hệ với dì/cô — người phụ nữ lớn tuổi hơn trong họ hàng, thường gắn với sự vụng trộm trong gia đình.', 13)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('based-game-d-a-theo-game', 'Based Game · Dựa Theo Game', 'Nội dung hentai được chuyển thể từ game người lớn. Có thể giữ nguyên tạo hình, tình huống và bối cảnh của game gốc.', 929)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('bbm', 'BBM', 'Nhân vật nam có thân hình to lớn, cơ bắp, thường xuất hiện trong các cảnh mạnh mẽ, quyền lực.', 1089)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('bbw', 'BBW', 'Nhân vật nữ có thân hình đầy đặn, quyến rũ, tập trung vào vẻ đẹp tự nhiên và sự gợi cảm.', 756)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('bdsm', 'BDSM', 'Trói buộc, kiểm soát, đau đớn, phục tùng. Gồm nhiều cấp độ: từ nhẹ (bịt mắt, trói tay) đến nặng (đánh, tra tấn, điều khiển tâm lý).', 1449)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('beach-b-i-bi-n', 'Beach · Bãi Biển', 'Bối cảnh diễn ra tại bãi biển hoặc hồ bơi, nơi nhân vật mặc bikini, đồ bơi hở hang, cơ thể ướt át. Thường mang không khí vui tươi, gợi cảm và tự do.', 8)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('bestiality', 'Bestiality', 'Quan hệ tình dục giữa con người và động vật thật, mang yếu tố cấm kỵ, gây tranh cãi mạnh.', 487)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('big-ass-m-ng-to', 'Big Ass · Mông To', 'Tập trung vào nhân vật nữ có vòng 3 to, tròn, căng mẩy.', 8699)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('big-boobs-ng-c-to', 'Big Boobs · Ngực To', 'Vòng 1 ngoại cỡ, thường rung động mạnh khi va chạm. Nét vẽ được phóng đại chuyển động và độ căng mọng của ngực.', 24378)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('big-penis-d-ng-v-t-to', 'Big Penis · Dương Vật To', 'Dương vật ngoại cỡ, quá khổ so với bình thường. Nhấn mạnh sự đau đớn – sung sướng cực độ từ việc bị “nhồi nhét” quá mức.', 9281)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('bikini', 'Bikini', '', 394)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('bisexual-song-t-nh', 'Bisexual · Song Tính', 'Nhân vật có xu hướng tình dục với cả nam và nữ, thể hiện sự đa dạng trong các mối quan hệ.', 65)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('black-skin-da-en', 'Black Skin · Da Đen', '', 173)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('blackmail-t-ng-ti-n', 'Blackmail · Tống Tiền', 'Cưỡng ép quan hệ bằng cách uy hiếp, đe dọa (bằng ảnh, clip, bí mật...). Tình huống thường căng thẳng, nhân vật rơi vào trạng thái vừa chống cự vừa bị kích thích.', 968)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('blindfold-b-t-m-t', 'Blindfold · Bịt Mắt', 'Quan hệ khi nhân vật bị bịt mắt, tăng cảm giác bí ẩn và kích thích.', 101)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('bloomers-qu-n-i', 'Bloomers · Quần Đùi', 'Nhân vật mặc quần bó thể thao kiểu Nhật, thường xuất hiện trong bối cảnh học đường hoặc luyện tập.', 404)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('blowjobs', 'BlowJobs', 'Dùng miệng để kích thích dương vật. Có thể đi kèm các kỹ thuật sâu như lick, suck, deepthroat.', 16227)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('body-swap-ho-n-i-th-n-x-c', 'Body Swap · Hoán Đổi Thân Xác', '', 209)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('body-writing-vi-t-l-n-th-n-th', 'Body Writing · Viết Lên Thân Thể', 'Viết chữ hoặc vẽ lên cơ thể nhân vật, tạo cảm giác sở hữu và kích thích thị giác.', 65)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('bodysuit-suit-li-n-th-n', 'Bodysuit · Suit Liền Thân', 'Trang phục bó sát toàn thân (như latex, da bóng). Tôn lên đường cong, tạo cảm giác ngộp thở, quyến rũ và ướt át.', 597)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('bondage-tr-i-bu-c', 'Bondage · Trói Buộc', '', 1877)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('breast-sucking-b-ng-c', 'Breast Sucking · Bú Ngực', 'Hành động bú hoặc mút ngực, nhấn mạnh sự thân mật và khoái cảm.', 3328)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('breastjobs-ng-c', 'BreastJobs · Đụ Ngực', 'Kẹp dương vật giữa hai bầu ngực và di chuyển lên xuống để kích thích. Thường đi kèm với cảnh xuất tinh lên mặt hoặc ngực.', 1875)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('brocon', 'Brocon', '', 525)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('em-trai', 'Em Trai', '', 551)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('bukkake', 'Bukkake', 'Nhiều nhân vật xuất tinh lên một người, tạo cảnh tượng táo bạo và quá tải khoái cảm.', 175)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('bunny-girl-g-i-th', 'Bunny Girl · Gái Thỏ', 'Nhân vật nữ mặc trang phục thỏ gợi cảm với tai và tất lưới, tạo sức hút quyến rũ.', 156)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('business-suit-c-ng-s', 'Business Suit · Đồ Công Sở', 'Trang phục công sở bó sát – váy bút chì, áo sơ mi ôm, vest nữ. Hình ảnh “chị sếp/ thư ký” gợi cảm.', 524)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('chastity-belt', 'Chastity belt', 'Nhân vật đeo đai trinh tiết, nhấn mạnh sự kiểm soát và cấm đoán trong ham muốn.', 51)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('che-t', 'Che ít', '', 8322)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('che-nhi-u', 'Che nhiều', 'Nội dung gợi cảm nhưng vẫn kín đáo, tập trung vào trang phục che phủ nhiều nhưng vẫn khêu gợi.', 1678)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('cheating-ngo-i-t-nh', 'Cheating · Ngoại Tình', '', 3789)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('cheerleader-ho-t-n-o-vi-n', 'Cheerleader · Hoạt Náo Viên', 'Nhân vật mặc đồng phục cổ động năng động, gợi cảm trong bối cảnh thể thao hoặc học đường.', 17)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('chikan-qu-y-r-i', 'Chikan · Quấy Rối', 'Quấy rối tình dục nơi công cộng (tàu điện/xe buýt). Nhấn mạnh sự lén lút và cảm giác cấm kỵ.', 429)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('chinese-dress-s-n-x-m', 'Chinese Dress · Sườn Xám', 'Trang phục sườn xám xẻ cao, ôm sát, khoe đường cong. Thường gợi cảm tinh tế.', 119)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('c-che', 'Có che', '', 7897)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('collar-v-ng-c', 'Collar · Vòng Cổ', 'Vòng cổ biểu thị sự phục tùng, thuộc quyền sở hữu hoặc gắn kết quan hệ chủ - tớ.', 250)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('comedy-h-i-h-c', 'Comedy · Hài Hước', 'Tình huống tình dục pha hài hước, các “tai nạn”/hiểu lầm dẫn đến cảnh nóng vui nhộn.', 1482)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('comic', 'Comic', '', 1220)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('condom-bao-cao-su', 'Condom · Bao Cao Su', 'Quan hệ sử dụng bao cao su — nhấn mạnh an toàn hoặc như một chi tiết gợi cảm.', 2135)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('cosplay', 'Cosplay', 'Nhân vật hóa trang sexy như nữ hầu, bunny girl, nhân vật anime/game nổi tiếng, tăng yếu tố mới lạ và hấp dẫn thị giác.', 1258)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('cousin-anh-ch-em-h', 'Cousin · Anh Chị Em Họ', '', 356)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('creampie-xu-t-trong', 'Creampie · Xuất Trong', 'Quan hệ tình dục với hành động xuất tinh bên trong âm đạo, nhấn mạnh sự thân mật, khoái cảm trọn vẹn và cảm giác chiếm hữu.', 1023)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('cross-dressing-gi-trang', 'Cross-dressing · Giả Trang', 'Nhân vật mặc trang phục khác giới (nam giả nữ hoặc nữ giả nam), tạo tình huống bất ngờ, gợi cảm.', 199)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('crotch-tattoo-x-m-h-nh', 'Crotch Tattoo · Xăm Hình', 'Hình xăm vùng kín, cảm giác nổi loạn, táo bạo.', 307)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('cuckold-c-p-s-ng', 'Cuckold · Cặp Sừng', 'Chủ đề ngoại tình/“cắm sừng” (cuckold), thường gắn với NTR hoặc yếu tố tâm lý.', 25)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('cum-swap', 'Cum swap', 'Trao đổi tinh dịch qua miệng giữa các nhân vật, tạo cảm giác thân mật táo bạo.', 26)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('cunnilingus-v-t-m-ng', 'Cunnilingus · Vét Máng', 'Quan hệ bằng miệng tập trung kích thích âm đạo bằng môi và lưỡi.', 2341)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('dark-skin-da-ng-m', 'Dark Skin · Da Ngăm', 'Làn da nâu/sẫm. Thường được vẽ với vẻ đẹp gợi cảm, mạnh mẽ.', 2967)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('daughter', 'Daughter', '', 342)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('deepthroat-s-u-t-i-h-ng', 'Deepthroat · Sâu Tới Họng', 'Kỹ thuật ngậm sâu toàn bộ dương vật, thường gây nghẹn – cảm giác mãnh liệt.', 1912)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('demon-qu', 'Demon · Quỷ', '', 322)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('demongirl-n-qu-i', 'DemonGirl · Nữ Quái', 'Nữ quỷ (sừng/đuôi/ánh mắt dâm đãng), thường chủ động và thống trị.', 589)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('devil-c-qu', 'Devil · Ác Quỷ', '', 203)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('devilgirl-n-qu', 'DevilGirl · Nữ Quỷ', '', 531)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('dirty-b-n-th-u', 'Dirty · Bẩn Thỉu', '', 308)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('dirtyoldman', 'DirtyOldMan', '', 1454)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('double-penetration-hai-l', 'Double Penetration · Hai Lỗ', 'Quan hệ đồng thời qua hai đường (âm đạo & hậu môn).', 2751)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('doujinshi-ng-nh-n', 'Doujinshi · Đồng Nhân', 'Truyện 18+ do fan sáng tác, dùng nhân vật anime/game nổi tiếng hoặc tự tạo.', 10245)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('drama', 'Drama', '', 972)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('drug-ma-t-y', 'Drug · Ma Túy', '', 1276)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('drunk-say-r-u', 'Drunk · Say Rượu', 'Nhân vật say rượu, hành động tình dục diễn ra trong trạng thái mất kiểm soát hoặc mơ hồ.', 82)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('ecchi', 'Ecchi', 'Tình huống hớ hênh, đụng chạm vô tình… tạo tình huống nhạy cảm.', 732)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('elder-sister', 'Elder Sister', 'Chị gái trong các mối quan hệ gia đình hoặc cấm kỵ, thường vừa che chở vừa cám dỗ.', 281)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('elf-ti-n-t-c', 'Elf · Tiên Tộc', 'Chủng tộc yêu tinh, tai nhọn, mảnh mai; thường trong bối cảnh fantasy.', 755)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('exhibitionism-ph-d-m', 'Exhibitionism · Phô Dâm', 'Lộ bộ phận nhạy cảm trước người khác; thường gắn với tình huống bị nhìn lén, rình trộm hoặc chủ động phô bày táo bạo.', 2108)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('facesitting', 'Facesitting', 'Nhân vật ngồi lên mặt đối phương để được phục vụ khoái cảm trực tiếp.', 54)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('fantasy-gi-t-ng', 'Fantasy · Giả Tưởng', 'Bối cảnh giả tưởng, sinh vật huyền ảo; kết hợp yếu tố tình dục.', 935)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('father', 'Father', '', 187)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('females-only-ch-c-n', 'Females only · Chỉ Có Nữ', 'Chỉ có các nhân vật nữ xuất hiện, tạo không gian đồng giới hoặc nữ quyền.', 135)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('femdom-n-ch', 'Femdom · Nữ Chủ', 'Nữ làm chủ/điều khiển, áp đảo nam trong quan hệ tình dục.', 3483)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('feminization-n-t-nh-h-a', 'Feminization · Nữ Tính Hóa', 'Nam bị biến đổi hoặc hóa trang thành nữ, nhấn mạnh sự thay đổi giới tính và tâm lý.', 122)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('filming-quay-phim', 'Filming · Quay Phim', 'Cảnh làm tình bị quay phim hoặc ghi hình, có thể lén lút hoặc cố ý.', 52)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('fingering-d-ng-ng-n-tay', 'Fingering · Dùng Ngón Tay', 'Kích thích âm đạo hoặc điểm G bằng tay, thường là màn dạo đầu gợi cảm, thể hiện sự khéo léo và phản ứng mãnh liệt của nhân vật.', 3617)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('footjob', 'Footjob', 'Kích thích dương vật bằng bàn chân.', 1103)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('full-color-full-m-u', 'Full Color · Full Màu', 'Toàn bộ truyện được tô màu; màu sắc sống động tăng kích thích thị giác.', 7724)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('furry', 'Furry', '', 1020)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('futanari', 'Futanari', '', 1178)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('gag-b-t-mi-ng', 'Gag · Đồ Bịt Miệng', 'Nhân vật bị bịt miệng bằng đồ vật, tăng cảm giác bị khống chế và phục tùng.', 80)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('gangbang', 'Gangbang', '', 1749)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('garter-belts-ai-gi-t-t', 'Garter Belts · Đai Giữ Tất', 'Đai giữ tất tôn vẻ đẹp đôi chân và đường cong cơ thể, tăng độ gợi cảm.', 712)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('gender-bender-bi-n-i-gi-i-t-nh', 'Gender Bender · Biến Đổi Giới Tính', 'Nhân vật bị biến đổi giới tính (nam thành nữ hoặc ngược lại) qua phép thuật, thuốc hoặc công nghệ, tạo nên các tình huống hài hước và kích thích.', 908)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('ghost-ma', 'Ghost · Ma', '', 262)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('glasses-eo-k-nh', 'Glasses · Đeo Kính', '', 3504)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('glory-hole', 'Glory hole', 'Quan hệ qua lỗ kín trên vách ngăn, tăng yếu tố ẩn danh, bí ẩn và táo bạo.', 16)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('g-c-nh-n-n', 'Góc Nhìn Nữ', 'Góc nhìn nữ (Female POV) là thể loại kể chuyện đặt nhân vật nữ làm trung tâm trải nghiệm. Câu chuyện được dẫn dắt qua cảm xúc, suy nghĩ, nội tâm và cách nhìn nhận thế giới của nữ chính.', 6)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('gothic-lolita', 'Gothic Lolita', '', 70)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('group', 'Group', 'Cảnh quan hệ tình dục có từ ba người trở lên, tập trung vào tương tác chéo giữa các nhân vật, mang lại cảm giác mới lạ và mạnh mẽ.', 6650)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('guro-m-u-me', 'Guro · Máu Me', '', 434)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('gyaru', 'Gyaru', 'Nữ sinh phong cách gyaru: da rám nắng, trang điểm đậm, tóc nhuộm sáng, thời trang sành điệu và tính cách bạo dạn.', 66)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('hairjob', 'Hairjob', 'Kích thích bằng tóc, tạo trải nghiệm thị giác và xúc giác mới lạ.', 26)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('hairy-c-l-ng', 'Hairy · Có Lông', 'Nhân vật nữ có lông vùng kín rậm rạp, nhấn mạnh sự tự nhiên, trưởng thành và quyến rũ nguyên bản.', 2336)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('handjob', 'Handjob', '', 3622)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('harem-h-u-cung', 'Harem · Hậu Cung', 'Một nhân vật (thường nam) được nhiều nhân vật khác giới vây quanh.', 1995)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('hell-no', 'Hell No', 'Nội dung bị từ chối hoặc phản đối mạnh, đôi khi dùng làm yếu tố hài hước.', 9)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('hentaivn', 'Hentaivn', 'HentaiVN – web đọc truyện hentai vietsub, hentai không che, cập nhật nhanh, nội dung 18+ đa dạng, chất lượng cao.', 14106)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('hidden-sex-sex-l-n-l-t', 'Hidden sex · Sex Lén Lút', 'Quan hệ diễn ra bí mật, tránh bị người khác phát hiện, tăng cảm giác hồi hộp.', 126)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('historical-l-ch-s', 'Historical · Lịch Sử', 'Bối cảnh lịch sử, xa xưa; trang phục, phong tục và không gian cổ điển tạo nên sắc thái gợi cảm đặc trưng.', 153)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('horror-kinh-d', 'Horror · Kinh Dị', '', 202)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('housewife-n-i-tr', 'Housewife · Nội Trợ', '', 1497)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('humiliation-s-nh-c', 'Humiliation · Sỉ Nhục', 'Làm nhục, làm xấu hổ; mang tính ép buộc hoặc đặt nhân vật vào tình cảnh tiến thoái lưỡng nan không thể trốn tránh.', 1395)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('idol-th-n-t-ng', 'Idol · Thần Tượng', '', 460)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('imouto', 'Imouto', 'Em gái dễ thương, gắn bó với nhân vật chính, đôi khi phát triển cảm xúc cấm kỵ.', 583)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('incest-lo-n-lu-n', 'Incest · Loạn Luân', '', 4470)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('insect-c-n-tr-ng', 'Insect · Côn Trùng', 'Nhân vật hoặc sinh vật côn trùng tham gia cảnh tình dục kỳ lạ (khác với ''Côn trùng'' bản địa).', 24)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('invisible-t-ng-h-nh', 'Invisible · Tàng Hình', 'Nhân vật tàng hình hoặc không bị nhìn thấy, lợi dụng điều đó để tiếp cận đối phương.', 1)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('isekai-d-gi-i', 'Isekai · Dị Giới', 'Nhân vật sang thế giới khác; pha trộn phiêu lưu/ma thuật và tình dục.', 143)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('kh-ng-che', 'Không che', '', 9666)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('kimono', 'Kimono', '', 911)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('kissing-h-n', 'Kissing · Hôn', 'Hôn môi, thể hiện sự thân mật, khởi đầu cho cảm xúc và khoái cảm.', 971)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('kuudere-ngo-i-l-nh-trong-n-ng', 'Kuudere · Ngoài Lạnh Trong Nóng', 'Kiểu nhân vật bề ngoài cực kỳ lạnh lùng để che giấu cảm xúc bên trong; chỉ mở lòng khi được chinh phục.', 197)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('lactation-ti-t-s-a', 'Lactation · Tiết Sữa', 'Tiết sữa — nhân vật nữ ra sữa, thường gắn với ngực căng tức, bú mút hoặc vắt sữa.', 69)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('lingerie-l-t-g-i-c-m', 'Lingerie · Đồ Lót Gợi Cảm', 'Nhân vật mặc đồ lót gợi cảm như áo ngực, quần lót ren, corset hoặc tất lưới. Tập trung vào yếu tố thị giác, quyến rũ và kích thích.', 85)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('lolicon', 'Lolicon', 'Hentai chỉ là sản phẩm của trí tưởng tượng, không phản ánh cách con người thực sự cư xử, không phải tài liệu hướng dẫn cuộc sống hay tình dục. Hãy xem hentai như xem phim viễn tưởng: xem nhưng đừng nhầm lẫn với thực tế.', 6230)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('maids-h-u-g-i', 'Maids · Hầu Gái', '', 1209)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('males-only-ch-c-nam', 'Males only · Chỉ Có Nam', 'Chỉ có các nhân vật nam xuất hiện, tạo bối cảnh đồng giới nam.', 212)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('manhua', 'Manhua', '', 66)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('manhwa', 'Manhwa', 'Truyện tranh Hàn Quốc; nét vẽ mượt, hiện đại hoặc giả tưởng; hấp dẫn.', 544)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('masturbation-t-s-ng', 'Masturbation · Tự Sướng', 'Nhân vật tự kích thích bản thân bằng tay hoặc đồ chơi tình dục, thể hiện sự tò mò, cô đơn hoặc ham muốn dồn nén.', 2803)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('mature-tr-ng-th-nh', 'Mature · Trưởng Thành', 'Nhân vật trưởng thành, giàu kinh nghiệm, toát lên nét quyến rũ chín muồi.', 289)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('mermaid-ti-n-c', 'Mermaid · Tiên Cá', 'Nhân vật nữ người cá, kết hợp yếu tố giả tưởng dưới nước đầy mê hoặc.', 7)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('miko-vu-n-gi-n', 'Miko · Vu Nữ Giữ Đền', 'Vu nữ giữ đền với trang phục truyền thống, vẻ đẹp thanh khiết nhưng gợi cảm trong bối cảnh tâm linh Nhật Bản.', 289)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('milf-ph-n-y-n', 'Milf · Phụ Nữ Đầy Đặn', 'Phụ nữ trưởng thành, quyến rũ, giàu kinh nghiệm (mẹ kế, cô giáo…).', 4952)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('mind-break-t-y-n-o', 'Mind Break · Tẩy Não', 'Bị ép đến mức tâm trí vỡ vụn/tẩy não do khoái cảm hay áp lực tâm lý.', 4262)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('mind-control-thao-t-ng-t-m-tr', 'Mind Control · Thao Túng Tâm Trí', 'Bị thao túng tâm trí bằng ma thuật/thuốc/công nghệ, dẫn đến hành vi ngoài ý muốn.', 1907)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('monster-qu-i-v-t', 'Monster · Quái Vật', '', 963)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('monstergirl-n-qu-i-v-t', 'Monstergirl · Nữ Quái Vật', 'Nhân vật nữ mang đặc điểm quái vật (sừng, đuôi…), vừa dị thường vừa quyến rũ.', 792)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('mother', 'Mother', '', 1743)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('nakadashi-xu-t-trong', 'Nakadashi · Xuất Trong', '', 15575)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('netori', 'Netori', '', 964)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('ng-t', 'Ngọt', 'Nội dung ngọt ngào, lãng mạn, nhẹ nhàng (sweet/romance).', 146)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('nipple-play-ch-i-u-ng-c', 'Nipple Play · Chơi Đầu Ngực', 'Tập trung kích thích đầu ngực: mút, véo, dùng đồ chơi hoặc quan hệ trực tiếp với đầu ngực.', 96)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('non-hen', 'Non-hen', 'Nội dung không tập trung vào cảnh tình dục, thiên về cốt truyện hoặc hài hước.', 63)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('ntr', 'NTR', 'Nhân vật chính bị cắm sừng – người yêu/vợ bị người khác chiếm đoạt.', 4463)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('nun-n-tu', 'Nun · Nữ Tu', '', 255)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('nurse-y-t', 'Nurse · Y Tá', '', 392)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('office-lady-nv-v-n-ph-ng', 'Office Lady · NV Văn Phòng', 'Nhân vật nữ công sở mặc váy bút chì, áo sơ mi, vest – phong thái trưởng thành, quyến rũ nơi văn phòng.', 28)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('old-man-ng-gi', 'Old Man · Ông Già', 'Nhân vật nam lớn tuổi xuất hiện trong các tình huống cấm kỵ hoặc gây tò mò.', 1073)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('oneshot-ch-ng-n', 'Oneshot · Chương Đơn', 'Truyện ngắn chỉ trong một chương, tập trung vào một tình huống tình dục cụ thể, không có cốt truyện dài dòng.', 23092)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('oral', 'Oral', 'Quan hệ bằng miệng, tập trung mô tả kỹ thuật và khoái cảm trực tiếp.', 2048)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('osananajimi-b-n-thu-nh', 'Osananajimi · Bạn Thuở Nhỏ', 'Bạn thuở nhỏ gắn bó từ lâu, mối quan hệ chuyển dần sang lãng mạn hoặc tình dục.', 720)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('paizuri', 'Paizuri', 'Quan hệ tình dục với ngực (ép dương vật giữa bầu ngực để kích thích và đạt cực khoái).', 4303)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('pantyhose-qu-n-t-t', 'Pantyhose · Quần Tất', 'Nhân vật mặc quần tất mỏng, tôn đôi chân; thường rách/kéo xuống để tăng sự gợi cảm.', 1185)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('pegging', 'Pegging', 'Nữ dùng đồ chơi đeo để quan hệ qua hậu môn với nam, đảo ngược vai trò truyền thống.', 25)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('piercing-x-khuy-n', 'Piercing · Xỏ Khuyên', 'Khuyên trên cơ thể (môi, lưỡi, ngực…) tạo hình tượng nổi loạn và gợi cảm.', 99)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('police-c-nh-s-t', 'Police · Cảnh Sát', 'Nhân vật cảnh sát đồng phục, mang hình ảnh quyền lực, kiểm soát; đôi khi kết hợp yếu tố hành động.', 14)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('ponytail-t-c-u-i-ng-a', 'Ponytail · Tóc Đuôi Ngựa', 'Nhân vật buộc tóc đuôi ngựa, thể hiện sự năng động, khỏe khoắn và quyến rũ.', 1163)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('pregnant', 'Pregnant', '', 2267)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('princess-c-ng-ch-a', 'Princess · Công Chúa', '', 16)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('prostitution-m-i-d-m', 'Prostitution · Mại Dâm', 'Quan hệ tình dục để đổi lấy tiền: gái gọi, nhà thổ, bán dâm nghiệp dư.', 20)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('rape-c-ng-b-c', 'Rape · Cưỡng Bức', '', 6129)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('rimjob', 'Rimjob', 'Kích thích hậu môn bằng miệng, trải nghiệm táo bạo và cảm giác lạ.', 776)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('romance-t-nh-c-m', 'Romance · Tình Cảm', 'Tình dục gắn liền với tình yêu, đồng thuận, nhiều cảm xúc, không bạo lực.', 4598)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('ryona', 'Ryona', 'Nhân vật chịu đau đớn thể xác kết hợp yếu tố tình dục gây sốc và căng thẳng.', 372)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('scat', 'Scat', 'Nội dung liên quan đến phân – yếu tố cực đoan, gây tranh cãi và kén người xem.', 162)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('school-uniform-ng-ph-c', 'School uniform · Đồng Phục', '', 6393)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('schoolgirl-n-sinh', 'SchoolGirl · Nữ Sinh', 'Nữ sinh 16–18 tuổi, đồng phục váy ngắn, bối cảnh trường/ký túc xá/thư viện.', 6844)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('see-through-xuy-n-th-u', 'See-through · Xuyên Thấu', 'Quần áo ướt, mỏng hoặc xuyên thấu làm lộ cơ thể bên trong.', 21)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('series', 'Series', 'Truyện dài kỳ gồm nhiều chương, phát triển cốt truyện và nhân vật qua thời gian. Kết hợp yếu tố tình dục với mạch truyện hấp dẫn.', 4309)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('sex-toys-ch-i', 'Sex Toys · Đồ Chơi', '', 3291)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('shimapan-qu-n-s-c', 'Shimapan · Quần Sọc', 'Quần lót sọc dễ thương, thường dùng trong bối cảnh học đường hài hước hoặc gợi cảm.', 130)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('short-truy-n-ng-n', 'Short · Truyện Ngắn', 'Truyện ngắn hoặc one-shot chỉ có một chương, tập trung vào một tình huống tình dục duy nhất, diễn biến nhanh và trực tiếp.', 892)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('shota', 'Shota', '', 4181)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('shoujo', 'Shoujo', 'Phong cách hướng tới nữ trẻ: cảm xúc lãng mạn, nhẹ nhàng, giàu biểu cảm.', 318)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('siscon', 'Siscon', '', 476)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('em-g-i', 'Em Gái', '', 2013)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('sixty-nine-69', 'Sixty-Nine · 69', 'Tư thế hai người đồng thời kích thích nhau bằng miệng, nhấn mạnh sự tương hỗ.', 22)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('slave-n-l', 'Slave · Nô Lệ', '', 1632)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('sleeping-trong-gi-c-ng', 'Sleeping · Trong Giấc Ngủ', '', 739)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('small-boobs-ng-c-nh', 'Small Boobs · Ngực Nhỏ', '', 4820)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('soft-incest-lo-n-lu-n-nh', 'Soft Incest · Loạn Luân Nhẹ', 'Quan hệ/tình cảm họ hàng xa (anh họ–em họ, con riêng–mẹ kế…), không huyết thống trực tiếp.', 14)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('son-con-trai', 'Son · Con Trai', '', 142)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('spanking-nh-t', 'Spanking · Đánh Đít', 'Đánh mông tạo cảm giác đau nhẹ xen khoái cảm và phục tùng.', 43)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('sport-th-thao', 'Sport · Thể Thao', '', 68)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('squirting', 'Squirting', 'Nữ đạt cực khoái phun nước mạnh mẽ, nhấn mạnh sự mãnh liệt và chân thực.', 506)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('stockings-qu-n-t-t', 'Stockings · Quần Tất', '', 7706)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('strap-on', 'Strap-on', 'Dùng đồ chơi đeo (dương vật giả) để chủ động quan hệ với đối phương.', 37)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('succubus-n-qu-h-t-tinh', 'Succubus · Nữ Quỷ Hút Tinh', 'Nhân vật là nữ quỷ dâm dục chuyên quyến rũ đàn ông để hút sinh lực, mang vẻ đẹp ma mị, chủ động và tràn đầy dục vọng.', 10)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('supernatural-si-u-nhi-n', 'Supernatural · Siêu Nhiên', 'Kết hợp yếu tố siêu nhiên như ma quỷ, phép thuật, thần linh hoặc năng lực đặc biệt với tình dục, tạo không khí huyền bí và kích thích.', 433)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('sweating-m-h-i', 'Sweating · Đổ Mồ Hôi', 'Chảy mồ hôi nhiều; trong cảnh quan hệ nhấn mạnh cơ thể ướt át, hơi thở gấp và cao trào mãnh liệt.', 2553)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('swimsuit-b-i', 'Swimsuit · Đồ Bơi', 'Đồ bơi (bikini/one-piece) ở bãi biển/hồ bơi; gợi cảm trẻ trung.', 2623)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('tail-plug-g-n-u-i-th', 'Tail plug · Gắn Đuôi Thú', 'Đồ chơi hình đuôi thú gắn vào cơ thể, tạo nét hoang dã và gợi cảm.', 66)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('tall-girl-g-i-cao-l-n', 'Tall Girl · Gái Cao Lớn', 'Gái cao ráo, chân dài; thường có chiều cao vượt nam chính, tạo cảm giác áp đảo và quyến rũ.', 678)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('teacher-gi-o-vi-n', 'Teacher · Giáo Viên', '', 2370)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('tentacles-x-c-tu', 'Tentacles · Xúc Tu', '', 789)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('threesome-ba-ng-i', 'Threesome · Ba Người', 'Cảnh quan hệ giữa ba người (thường là hai nữ một nam hoặc ngược lại), nhấn mạnh cảm giác đa chiều, ghen tuông nhẹ và khoái cảm mạnh mẽ.', 219)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('time-stop-d-ng-th-i-gian', 'Time Stop · Dừng Thời Gian', '', 88)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('tomboy', 'Tomboy', '', 897)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('tracksuit-th-thao', 'Tracksuit · Đồ Thể Thao', 'Nhân vật mặc đồ thể thao bó sát, nhấn mạnh sự khỏe khoắn và đường cong.', 137)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('transformation-bi-n-h-nh', 'Transformation · Biến Hình', 'Nhân vật biến thân sang hình thể khác (ma thuật, công nghệ, lời nguyền...), mang đến trải nghiệm gợi cảm mới lạ.', 278)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('trap-b-y', 'Trap · Bẫy', 'Nhân vật nam ăn mặc hoặc thể hiện như nữ; ngoại hình và/hoặc tính cách nữ tính tạo nên sự nhập nhằng giới tính gợi cảm.', 1366)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('truy-n-vi-t', 'Truyện Việt', '', 29)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('tsundere-ki-u-ng-o', 'Tsundere · Kiêu Ngạo', 'Ngoài lạnh trong ấm; tương phản tính cách khi vào cảnh thân mật.', 1121)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('tu-ti-n', 'Tu Tiên', 'Thể loại tu luyện/tiên hiệp: luyện công, thăng cấp, thế giới huyền huyễn.', 24)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('twins-song-sinh', 'Twins · Song Sinh', '', 282)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('twintails-t-c-hai-b-m', 'Twintails · Tóc Hai Bím', 'Tóc buộc hai bên trẻ trung, thường gắn với tính cách năng động hoặc tsundere nhẹ.', 1861)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('underwater-d-i-n-c', 'Underwater · Dưới Nước', '', 10)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('vampire-ma-c-r-ng', 'Vampire · Ma Cà Rồng', 'Ma cà rồng quyến rũ, kết hợp yếu tố hút máu và mê hoặc dục tính.', 171)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('vanilla-t-nh-c-m-nh-nh-ng', 'Vanilla · Tình Cảm Nhẹ Nhàng', 'Cảnh sex nhẹ nhàng, đồng thuận; tập trung kết nối cảm xúc.', 5122)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('virgin-trinh', 'Virgin · Trinh', '', 3526)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('voyeurism-nh-n-tr-m', 'Voyeurism · Nhìn Trộm', 'Nhìn trộm hoặc quay lén cảnh riêng tư mà đối phương không hay biết.', 10)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('vtuber', 'Vtuber', 'Nhân vật ảo do streamer điều khiển, xuất hiện trong nội dung gợi cảm hoặc tương tác độc đáo.', 176)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('watersports-n-c-ti-u', 'Watersports · Nước Tiểu', 'Nội dung liên quan tới nước tiểu: tiểu tiện, bị tưới lên người hoặc uống.', 16)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('webtoon', 'Webtoon', '', 197)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('wormhole', 'Wormhole', 'Quan hệ qua cổng không gian hoặc lối xuyên chiều, tăng tính kỳ ảo mới lạ.', 8)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('x-ray', 'X-ray', '', 8084)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('yandere-cu-ng-y-u', 'Yandere · Cuồng Yêu', '', 459)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('yaoi-am-m', 'Yaoi · Đam Mỹ', 'Quan hệ giữa hai nam; có thể lãng mạn/đam mỹ, phổ biến trong cộng đồng BL.', 2077)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('yuri-b-ch-h-p', 'Yuri · Bách Hợp', 'Quan hệ giữa hai nữ; nhấn mạnh sự lãng mạn/gợi cảm, nhẹ nhàng hoặc mãnh liệt.', 2002)");
    await db.execute("INSERT OR REPLACE INTO genres (slug, name, description, comic_count) VALUES ('zombie-x-c-s-ng', 'Zombie · Xác Sống', 'Xác sống xuất hiện trong bối cảnh kinh dị, xen yếu tố tình dục kỳ quái hoặc đen tối.', 101)");

    
    await db.execute(`UPDATE genres SET description = 'Nhân vật bước vào hành trình phiêu lưu, chiến đấu kịch tính kết hợp khám phá thế giới fantasy, dị giới.' WHERE slug = 'hanh-dong'`);
    await db.execute(`UPDATE genres SET description = 'Tác phẩm dành riêng cho độc giả trưởng thành, nội dung nhạy cảm.' WHERE slug = 'ngon-tinh'`);
    await db.execute(`UPDATE genres SET description = 'Biểu cảm nhân vật khi đạt cực khoái mạnh liệt: mắt đảo, lưỡi thè, mặt đỏ, nước dãi chảy ra.' WHERE slug = 'ahegao' OR slug = 'adult'`);

    migrated = true;
  } catch (err) {
    console.error('Migration warning:', err);
  }
}
