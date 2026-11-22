import json
import re

prompt_text = """
VinaHentai
Tìm truyện hoặc mã...
Nâng cao
Namdz
Namdz
Thoát
Trang chủ
Thể loại
BXH
Triệu hồi
Hoàn thành
Random
Tủ truyện
Tất cả thể loại truyện hentai
Tìm kiếm thể loại...
#
3D Hentai
0 truyện >
Truyện tranh hoặc video hentai sử dụng đồ họa 3D.

Áo dài
0 truyện >
âu Cổ
1 truyện >
Đam Mỹ
0 truyện >
Đời Thường
0 truyện >
Ảnh động
0 truyện >
A
AI Generated
0 truyện >
AI Generated · Tạo Bởi AI
0 truyện >
Tác phẩm do AI tạo ra (nét vẽ, hình ảnh, truyện); nhấn mạnh phong cách, hiệu ứng và sự độc đáo của công cụ AI.

Action
0 truyện >
Action · Hành Động
0 truyện >
Adult
0 truyện >
Adult · Người Lớn
0 truyện >
Adventure
0 truyện >
Adventure · Phiêu Lưu
0 truyện >
Nhân vật bước vào hành trình phiêu lưu: thế giới fantasy, dị giới, hoặc vùng đất xa lạ. Nội dung kết hợp tình dục với yếu tố hành động, khám phá, và cốt truyện dài.

Ahegao
0 truyện >
Biểu cảm nhân vật khi đạt cực khoái mãnh liệt: mắt đảo, lưỡi thè, mặt đỏ, nước dãi chảy ra. Thể hiện sự mất kiểm soát và khoái cảm tột độ.

Anal
0 truyện >
Quan hệ tình dục qua đường hậu môn.

Anal · Hậu Môn
0 truyện >
Quan hệ tình dục qua đường hậu môn.

Angel
0 truyện >
Angel · Thiên Thần
0 truyện >
Animal
0 truyện >
Animal Girl
0 truyện >
Nhân vật nữ mang đặc điểm động vật như tai, đuôi, móng vuốt (mèo, chó, cáo, thỏ...). Tính cách thường dễ thương hoặc hoang dã, gợi cảm theo kiểu "nửa người nửa thú".

Animal Girl · Nữ Thú Nhân
0 truyện >
Nhân vật nữ mang đặc điểm động vật như tai, đuôi, móng vuốt (mèo, chó, cáo, thỏ...). Tính cách thường dễ thương hoặc hoang dã, gợi cảm theo kiểu "nửa người nửa thú".

Apron
0 truyện >
Tạp dề không nội y. Nhân vật nữ chỉ mặc duy nhất chiếc tạp dề mỏng, thường là vợ đảm, mẹ kế hoặc cô gái phục vụ trong nhà – mang cảm giác "nguy hiểm trong an toàn".

Apron · Tạp Dề
0 truyện >
Tạp dề không nội y. Nhân vật nữ chỉ mặc duy nhất chiếc tạp dề mỏng, thường là vợ đảm, mẹ kế hoặc cô gái phục vụ trong nhà – mang cảm giác "nguy hiểm trong an toàn".

Artist CG
0 truyện >
Artist CG · CG Họa Sĩ
0 truyện >
Bộ tranh vẽ minh họa (CG – computer graphic) từ các họa sĩ hentai nổi tiếng. Thường không có cốt truyện rõ, chủ yếu là các cảnh sex chất lượng cao và tạo hình đẹp.

Aunt
0 truyện >
Quan hệ với dì/cô — người phụ nữ lớn tuổi hơn trong họ hàng, thường gắn với sự vụng trộm trong gia đình.

Aunt · Dì
0 truyện >
Quan hệ với dì/cô — người phụ nữ lớn tuổi hơn trong họ hàng, thường gắn với sự vụng trộm trong gia đình.

B
BBM
0 truyện >
Nhân vật nam có thân hình to lớn, cơ bắp, thường xuất hiện trong các cảnh mạnh mẽ, quyền lực.

BBW
0 truyện >
Nhân vật nữ có thân hình đầy đặn, quyến rũ, tập trung vào vẻ đẹp tự nhiên và sự gợi cảm.

BDSM
0 truyện >
Trói buộc, kiểm soát, đau đớn, phục tùng. Gồm nhiều cấp độ: từ nhẹ (bịt mắt, trói tay) đến nặng (đánh, tra tấn, điều khiển tâm lý).

Based Game
0 truyện >
Nội dung hentai được chuyển thể từ game người lớn. Có thể giữ nguyên tạo hình, tình huống và bối cảnh của game gốc.

Based Game · Dựa Theo Game
0 truyện >
Nội dung hentai được chuyển thể từ game người lớn. Có thể giữ nguyên tạo hình, tình huống và bối cảnh của game gốc.

Beach
0 truyện >
Bối cảnh diễn ra tại bãi biển hoặc hồ bơi, nơi nhân vật mặc bikini, đồ bơi hở hang, cơ thể ướt át. Thường mang không khí vui tươi, gợi cảm và tự do.

Beach · Bãi Biển
0 truyện >
Bối cảnh diễn ra tại bãi biển hoặc hồ bơi, nơi nhân vật mặc bikini, đồ bơi hở hang, cơ thể ướt át. Thường mang không khí vui tươi, gợi cảm và tự do.

Bestiality
0 truyện >
Quan hệ tình dục giữa con người và động vật thật, mang yếu tố cấm kỵ, gây tranh cãi mạnh.

Big Ass
0 truyện >
Tập trung vào nhân vật nữ có vòng 3 to, tròn, căng mẩy.

Big Ass · Mông To
0 truyện >
Tập trung vào nhân vật nữ có vòng 3 to, tròn, căng mẩy.

Big Boobs
0 truyện >
Vòng 1 ngoại cỡ, thường rung động mạnh khi va chạm. Nét vẽ được phóng đại chuyển động và độ căng mọng của ngực.

Big Boobs · Ngực To
0 truyện >
Vòng 1 ngoại cỡ, thường rung động mạnh khi va chạm. Nét vẽ được phóng đại chuyển động và độ căng mọng của ngực.

Big Penis
0 truyện >
Dương vật ngoại cỡ, quá khổ so với bình thường. Nhấn mạnh sự đau đớn – sung sướng cực độ từ việc bị “nhồi nhét” quá mức.

Big Penis · Dương Vật To
0 truyện >
Dương vật ngoại cỡ, quá khổ so với bình thường. Nhấn mạnh sự đau đớn – sung sướng cực độ từ việc bị “nhồi nhét” quá mức.

Bikini
0 truyện >
Bisexual
0 truyện >
Nhân vật có xu hướng tình dục với cả nam và nữ, thể hiện sự đa dạng trong các mối quan hệ.

Bisexual · Song Tính
0 truyện >
Nhân vật có xu hướng tình dục với cả nam và nữ, thể hiện sự đa dạng trong các mối quan hệ.

Black Skin
0 truyện >
Black Skin · Da Đen
0 truyện >
Blackmail
0 truyện >
Cưỡng ép quan hệ bằng cách uy hiếp, đe dọa (bằng ảnh, clip, bí mật...). Tình huống thường căng thẳng, nhân vật rơi vào trạng thái vừa chống cự vừa bị kích thích.

Blackmail · Tống Tiền
0 truyện >
Cưỡng ép quan hệ bằng cách uy hiếp, đe dọa (bằng ảnh, clip, bí mật...). Tình huống thường căng thẳng, nhân vật rơi vào trạng thái vừa chống cự vừa bị kích thích.

Blindfold
0 truyện >
Quan hệ khi nhân vật bị bịt mắt, tăng cảm giác bí ẩn và kích thích.

Blindfold · Bịt Mắt
0 truyện >
Quan hệ khi nhân vật bị bịt mắt, tăng cảm giác bí ẩn và kích thích.

Bloomers
0 truyện >
Nhân vật mặc quần bó thể thao kiểu Nhật, thường xuất hiện trong bối cảnh học đường hoặc luyện tập.

Bloomers · Quần Đùi
0 truyện >
Nhân vật mặc quần bó thể thao kiểu Nhật, thường xuất hiện trong bối cảnh học đường hoặc luyện tập.

BlowJobs
0 truyện >
Dùng miệng để kích thích dương vật. Có thể đi kèm các kỹ thuật sâu như lick, suck, deepthroat.

Body Swap
0 truyện >
Hoán Đổi Thân Xác

Body Swap · Hoán Đổi Thân Xác
0 truyện >
Body Writing
0 truyện >
Viết chữ hoặc vẽ lên cơ thể nhân vật, tạo cảm giác sở hữu và kích thích thị giác.

Body Writing · Viết Lên Thân Thể
0 truyện >
Viết chữ hoặc vẽ lên cơ thể nhân vật, tạo cảm giác sở hữu và kích thích thị giác.

Bodysuit
0 truyện >
Trang phục bó sát toàn thân (như latex, da bóng). Tôn lên đường cong, tạo cảm giác ngộp thở, quyến rũ và ướt át.

Bodysuit · Suit Liền Thân
0 truyện >
Trang phục bó sát toàn thân (như latex, da bóng). Tôn lên đường cong, tạo cảm giác ngộp thở, quyến rũ và ướt át.

Bondage
0 truyện >
Bondage · Trói Buộc
0 truyện >
Breast Sucking
0 truyện >
Hành động bú hoặc mút ngực, nhấn mạnh sự thân mật và khoái cảm.

Breast Sucking · Bú Ngực
0 truyện >
Hành động bú hoặc mút ngực, nhấn mạnh sự thân mật và khoái cảm.

BreastJobs
0 truyện >
Kẹp dương vật giữa hai bầu ngực và di chuyển lên xuống để kích thích. Thường đi kèm với cảnh xuất tinh lên mặt hoặc ngực.

BreastJobs · Đụ Ngực
0 truyện >
Kẹp dương vật giữa hai bầu ngực và di chuyển lên xuống để kích thích. Thường đi kèm với cảnh xuất tinh lên mặt hoặc ngực.

Brocon
0 truyện >
Brother
0 truyện >
Anh/Em Trai

Bukkake
0 truyện >
Nhiều nhân vật xuất tinh lên một người, tạo cảnh tượng táo bạo và quá tải khoái cảm.

Bunny Girl
0 truyện >
Nhân vật nữ mặc trang phục thỏ gợi cảm với tai và tất lưới, tạo sức hút quyến rũ.

Bunny Girl · Gái Thỏ
0 truyện >
Nhân vật nữ mặc trang phục thỏ gợi cảm với tai và tất lưới, tạo sức hút quyến rũ.

Business Suit
0 truyện >
Trang phục công sở bó sát – váy bút chì, áo sơ mi ôm, vest nữ. Hình ảnh “chị sếp/ thư ký” gợi cảm.

Business Suit · Đồ Công Sở
0 truyện >
Trang phục công sở bó sát – váy bút chì, áo sơ mi ôm, vest nữ. Hình ảnh “chị sếp/ thư ký” gợi cảm.

Bách Hợp
0 truyện >
Bảng xếp hạng truyện hentai
0 truyện >
C
Chastity belt
0 truyện >
Nhân vật đeo đai trinh tiết, nhấn mạnh sự kiểm soát và cấm đoán trong ham muốn.

Che nhiều
0 truyện >
Nội dung gợi cảm nhưng vẫn kín đáo, tập trung vào trang phục che phủ nhiều nhưng vẫn khêu gợi.

Che ít
0 truyện >
Cheating
0 truyện >
Cheating · Ngoại Tình
0 truyện >
Cheerleader
0 truyện >
Nhân vật mặc đồng phục cổ động năng động, gợi cảm trong bối cảnh thể thao hoặc học đường.

Cheerleader · Hoạt Náo Viên
0 truyện >
Nhân vật mặc đồng phục cổ động năng động, gợi cảm trong bối cảnh thể thao hoặc học đường.

Chikan
0 truyện >
Quấy rối tình dục nơi công cộng (tàu điện/xe buýt). Nhấn mạnh sự lén lút và cảm giác cấm kỵ.

Chikan · Quấy Rối
0 truyện >
Quấy rối tình dục nơi công cộng (tàu điện/xe buýt). Nhấn mạnh sự lén lút và cảm giác cấm kỵ.

Chinese Dress
0 truyện >
Trang phục sườn xám xẻ cao, ôm sát, khoe đường cong. Thường gợi cảm tinh tế.

Chinese Dress · Sườn Xám
0 truyện >
Trang phục sườn xám xẻ cao, ôm sát, khoe đường cong. Thường gợi cảm tinh tế.

Chuyển Sinh
1 truyện >
Collar
0 truyện >
Vòng cổ biểu thị sự phục tùng, thuộc quyền sở hữu hoặc gắn kết quan hệ chủ - tớ.

Collar · Vòng Cổ
0 truyện >
Vòng cổ biểu thị sự phục tùng, thuộc quyền sở hữu hoặc gắn kết quan hệ chủ - tớ.

Comedy
0 truyện >
Tình huống tình dục pha hài hước, các “tai nạn”/hiểu lầm dẫn đến cảnh nóng vui nhộn.

Comedy · Hài Hước
0 truyện >
Tình huống tình dục pha hài hước, các “tai nạn”/hiểu lầm dẫn đến cảnh nóng vui nhộn.

Comic
0 truyện >
Condom
0 truyện >
Quan hệ sử dụng bao cao su — nhấn mạnh an toàn hoặc như một chi tiết gợi cảm.

Condom · Bao Cao Su
0 truyện >
Quan hệ sử dụng bao cao su — nhấn mạnh an toàn hoặc như một chi tiết gợi cảm.

Cosplay
0 truyện >
Nhân vật hóa trang sexy như nữ hầu, bunny girl, nhân vật anime/game nổi tiếng, tăng yếu tố mới lạ và hấp dẫn thị giác.

Cousin
0 truyện >
Anh Chị Em Họ

Cousin · Anh Chị Em Họ
0 truyện >
Creampie
0 truyện >
Quan hệ tình dục với hành động xuất tinh bên trong âm đạo, nhấn mạnh sự thân mật, khoái cảm trọn vẹn và cảm giác chiếm hữu.

Creampie · Xuất Trong
0 truyện >
Quan hệ tình dục với hành động xuất tinh bên trong âm đạo, nhấn mạnh sự thân mật, khoái cảm trọn vẹn và cảm giác chiếm hữu.

Cross-dressing
0 truyện >
Nhân vật mặc trang phục khác giới (nam giả nữ hoặc nữ giả nam), tạo tình huống bất ngờ, gợi cảm.

Cross-dressing · Giả Trang
0 truyện >
Nhân vật mặc trang phục khác giới (nam giả nữ hoặc nữ giả nam), tạo tình huống bất ngờ, gợi cảm.

Crotch Tattoo
0 truyện >
Hình xăm vùng kín, cảm giác nổi loạn, táo bạo.

Crotch Tattoo · Xăm Hình
0 truyện >
Hình xăm vùng kín, cảm giác nổi loạn, táo bạo.

Cuckold
0 truyện >
Chủ đề ngoại tình/“cắm sừng” (cuckold), thường gắn với NTR hoặc yếu tố tâm lý.

Cuckold · Cặp Sừng
0 truyện >
Chủ đề ngoại tình/“cắm sừng” (cuckold), thường gắn với NTR hoặc yếu tố tâm lý.

Cum swap
0 truyện >
Trao đổi tinh dịch qua miệng giữa các nhân vật, tạo cảm giác thân mật táo bạo.

Cunnilingus
0 truyện >
Quan hệ bằng miệng tập trung kích thích âm đạo bằng môi và lưỡi.

Cunnilingus · Vét Máng
0 truyện >
Quan hệ bằng miệng tập trung kích thích âm đạo bằng môi và lưỡi.

Có che
0 truyện >
Cổ Đại
0 truyện >
D
Danh sách truyện
0 truyện >
Danh sách truyện hentai
0 truyện >
Dark Skin
0 truyện >
Làn da nâu/sẫm. Thường được vẽ với vẻ đẹp gợi cảm, mạnh mẽ.

Dark Skin · Da Ngăm
0 truyện >
Làn da nâu/sẫm. Thường được vẽ với vẻ đẹp gợi cảm, mạnh mẽ.

Daughter
0 truyện >
Deepthroat
0 truyện >
Kỹ thuật ngậm sâu toàn bộ dương vật, thường gây nghẹn – cảm giác mãnh liệt.

Deepthroat · Sâu Tới Họng
0 truyện >
Kỹ thuật ngậm sâu toàn bộ dương vật, thường gây nghẹn – cảm giác mãnh liệt.

Demon
0 truyện >
Demon · Quỷ
0 truyện >
DemonGirl
0 truyện >
Nữ quỷ (sừng/đuôi/ánh mắt dâm đãng), thường chủ động và thống trị.

DemonGirl · Nữ Quái
0 truyện >
Nữ quỷ (sừng/đuôi/ánh mắt dâm đãng), thường chủ động và thống trị.

Devil
0 truyện >
Devil · Ác Quỷ
0 truyện >
DevilGirl
0 truyện >
DevilGirl · Nữ Quỷ
0 truyện >
Dirty
0 truyện >
Dirty · Bẩn Thỉu
0 truyện >
DirtyOldMan
0 truyện >
Double Penetration
0 truyện >
Quan hệ đồng thời qua hai đường (âm đạo & hậu môn).

Double Penetration · Hai Lỗ
0 truyện >
Quan hệ đồng thời qua hai đường (âm đạo & hậu môn).

Doujinshi
0 truyện >
Truyện 18+ do fan sáng tác, dùng nhân vật anime/game nổi tiếng hoặc tự tạo.

Doujinshi · Đồng Nhân
0 truyện >
Truyện 18+ do fan sáng tác, dùng nhân vật anime/game nổi tiếng hoặc tự tạo.

Drama
0 truyện >
Drug
0 truyện >
Drug · Ma Túy
0 truyện >
Drunk
0 truyện >
Nhân vật say rượu, hành động tình dục diễn ra trong trạng thái mất kiểm soát hoặc mơ hồ.

Drunk · Say Rượu
0 truyện >
Nhân vật say rượu, hành động tình dục diễn ra trong trạng thái mất kiểm soát hoặc mơ hồ.

E
Ecchi
0 truyện >
Tình huống hớ hênh, đụng chạm vô tình… tạo tình huống nhạy cảm.

Elder Sister
0 truyện >
Chị gái trong các mối quan hệ gia đình hoặc cấm kỵ, thường vừa che chở vừa cám dỗ.

Elf
0 truyện >
Chủng tộc yêu tinh, tai nhọn, mảnh mai; thường trong bối cảnh fantasy.

Elf · Tiên Tộc
0 truyện >
Chủng tộc yêu tinh, tai nhọn, mảnh mai; thường trong bối cảnh fantasy.

Em Gái
0 truyện >
Em Trai
0 truyện >
Exhibitionism
0 truyện >
Lộ bộ phận nhạy cảm trước người khác; thường gắn với tình huống bị nhìn lén, rình trộm hoặc chủ động phô bày táo bạo.

Exhibitionism · Phô Dâm
0 truyện >
Lộ bộ phận nhạy cảm trước người khác; thường gắn với tình huống bị nhìn lén, rình trộm hoặc chủ động phô bày táo bạo.

F
Facesitting
0 truyện >
Nhân vật ngồi lên mặt đối phương để được phục vụ khoái cảm trực tiếp.

Fantasy
0 truyện >
Bối cảnh giả tưởng, sinh vật huyền ảo; kết hợp yếu tố tình dục.

Fantasy · Giả Tưởng
0 truyện >
Bối cảnh giả tưởng, sinh vật huyền ảo; kết hợp yếu tố tình dục.

Father
0 truyện >
Females only
0 truyện >
Chỉ có các nhân vật nữ xuất hiện, tạo không gian đồng giới hoặc nữ quyền.

Females only · Chỉ Có Nữ
0 truyện >
Chỉ có các nhân vật nữ xuất hiện, tạo không gian đồng giới hoặc nữ quyền.

Femdom
0 truyện >
Nữ làm chủ/điều khiển, áp đảo nam trong quan hệ tình dục.

Femdom · Nữ Chủ
0 truyện >
Nữ làm chủ/điều khiển, áp đảo nam trong quan hệ tình dục.

Feminization
0 truyện >
Nam bị biến đổi hoặc hóa trang thành nữ, nhấn mạnh sự thay đổi giới tính và tâm lý.

Feminization · Nữ Tính Hóa
0 truyện >
Nam bị biến đổi hoặc hóa trang thành nữ, nhấn mạnh sự thay đổi giới tính và tâm lý.

Filming
0 truyện >
Cảnh làm tình bị quay phim hoặc ghi hình, có thể lén lút hoặc cố ý.

Filming · Quay Phim
0 truyện >
Cảnh làm tình bị quay phim hoặc ghi hình, có thể lén lút hoặc cố ý.

Fingering
0 truyện >
Kích thích âm đạo hoặc điểm G bằng tay, thường là màn dạo đầu gợi cảm, thể hiện sự khéo léo và phản ứng mãnh liệt của nhân vật.

Fingering · Dùng Ngón Tay
0 truyện >
Kích thích âm đạo hoặc điểm G bằng tay, thường là màn dạo đầu gợi cảm, thể hiện sự khéo léo và phản ứng mãnh liệt của nhân vật.

Footjob
0 truyện >
Kích thích dương vật bằng bàn chân.

Full Color
0 truyện >
Full Color · Full Màu
0 truyện >
Toàn bộ truyện được tô màu; màu sắc sống động tăng kích thích thị giác.

Furry
0 truyện >
Futanari
0 truyện >
G
Gag
0 truyện >
Nhân vật bị bịt miệng bằng đồ vật, tăng cảm giác bị khống chế và phục tùng.

Gag · Đồ Bịt Miệng
0 truyện >
Nhân vật bị bịt miệng bằng đồ vật, tăng cảm giác bị khống chế và phục tùng.

Gangbang
0 truyện >
Garter Belts
0 truyện >
Đai giữ tất tôn vẻ đẹp đôi chân và đường cong cơ thể, tăng độ gợi cảm.

Garter Belts · Đai Giữ Tất
0 truyện >
Đai giữ tất tôn vẻ đẹp đôi chân và đường cong cơ thể, tăng độ gợi cảm.

Gender Bender
0 truyện >
Nhân vật bị biến đổi giới tính (nam thành nữ hoặc ngược lại) qua phép thuật, thuốc hoặc công nghệ, tạo nên các tình huống hài hước và kích thích.

Gender Bender · Biến Đổi Giới Tính
0 truyện >
Nhân vật bị biến đổi giới tính (nam thành nữ hoặc ngược lại) qua phép thuật, thuốc hoặc công nghệ, tạo nên các tình huống hài hước và kích thích.

Ghost
0 truyện >
Ghost · Ma
0 truyện >
Giả Tưởng
0 truyện >
Glasses
0 truyện >
Glasses · Đeo Kính
0 truyện >
Glory hole
0 truyện >
Quan hệ qua lỗ kín trên vách ngăn, tăng yếu tố ẩn danh, bí ẩn và táo bạo.

Gothic Lolita
0 truyện >
Group
0 truyện >
Cảnh quan hệ tình dục có từ ba người trở lên, tập trung vào tương tác chéo giữa các nhân vật, mang lại cảm giác mới lạ và mạnh mẽ.

Guro
0 truyện >
Guro · Máu Me
0 truyện >
Gyaru
0 truyện >
Nữ sinh phong cách gyaru: da rám nắng, trang điểm đậm, tóc nhuộm sáng, thời trang sành điệu và tính cách bạo dạn.

Góc Nhìn Nữ
0 truyện >
Góc nhìn nữ (Female POV) là thể loại kể chuyện đặt nhân vật nữ làm trung tâm trải nghiệm. Câu chuyện được dẫn dắt qua cảm xúc, suy nghĩ, nội tâm và cách nhìn nhận thế giới của nữ chính.

H
Hairjob
0 truyện >
Kích thích bằng tóc, tạo trải nghiệm thị giác và xúc giác mới lạ.

Hairy
0 truyện >
Nhân vật nữ có lông vùng kín rậm rạp, nhấn mạnh sự tự nhiên, trưởng thành và quyến rũ nguyên bản.

Hairy · Có Lông
0 truyện >
Nhân vật nữ có lông vùng kín rậm rạp, nhấn mạnh sự tự nhiên, trưởng thành và quyến rũ nguyên bản.

Handjob
0 truyện >
Harem
0 truyện >
Một nhân vật (thường nam) được nhiều nhân vật khác giới vây quanh.

Harem · Hậu Cung
0 truyện >
Một nhân vật (thường nam) được nhiều nhân vật khác giới vây quanh.

Hell No
0 truyện >
Nội dung bị từ chối hoặc phản đối mạnh, đôi khi dùng làm yếu tố hài hước.

Hentai 3D
8 truyện >
Hentai không che
8 truyện >
Hentaivn
0 truyện >
Hidden sex
0 truyện >
Quan hệ diễn ra bí mật, tránh bị người khác phát hiện, tăng cảm giác hồi hộp.

Hidden sex · Sex Lén Lút
0 truyện >
Quan hệ diễn ra bí mật, tránh bị người khác phát hiện, tăng cảm giác hồi hộp.

Historical
0 truyện >
Bối cảnh lịch sử, xa xưa; trang phục, phong tục và không gian cổ điển tạo nên sắc thái gợi cảm đặc trưng.

Historical · Lịch Sử
0 truyện >
Bối cảnh lịch sử, xa xưa; trang phục, phong tục và không gian cổ điển tạo nên sắc thái gợi cảm đặc trưng.

Horror
0 truyện >
Horror · Kinh Dị
0 truyện >
Housewife
0 truyện >
Housewife · Nội Trợ
0 truyện >
Humiliation
0 truyện >
Làm nhục, làm xấu hổ; mang tính ép buộc hoặc đặt nhân vật vào tình cảnh tiến thoái lưỡng nan không thể trốn tránh.

Humiliation · Sỉ Nhục
0 truyện >
Làm nhục, làm xấu hổ; mang tính ép buộc hoặc đặt nhân vật vào tình cảnh tiến thoái lưỡng nan không thể trốn tránh.

Hài Hước
0 truyện >
Hành Động
6 truyện >
Nhân vật bước vào hành trình phiêu lưu, chiến đấu kịch tính kết hợp khám phá thế giới fantasy, dị giới.

Hậu Cung
0 truyện >
Hệ Thống
1 truyện >
Học Đường
0 truyện >
I
Idol
0 truyện >
Idol · Thần Tượng
0 truyện >
Imouto
0 truyện >
Em gái dễ thương, gắn bó với nhân vật chính, đôi khi phát triển cảm xúc cấm kỵ.

Incest
0 truyện >
Incest · Loạn Luân
0 truyện >
Insect
0 truyện >
Nhân vật hoặc sinh vật côn trùng tham gia cảnh tình dục kỳ lạ (khác với 'Côn trùng' bản địa).

Insect · Côn Trùng
0 truyện >
Nhân vật hoặc sinh vật côn trùng tham gia cảnh tình dục kỳ lạ (khác với 'Côn trùng' bản địa).

Invisible
0 truyện >
Nhân vật tàng hình hoặc không bị nhìn thấy, lợi dụng điều đó để tiếp cận đối phương.

Invisible · Tàng Hình
0 truyện >
Nhân vật tàng hình hoặc không bị nhìn thấy, lợi dụng điều đó để tiếp cận đối phương.

Isekai
0 truyện >
Nhân vật sang thế giới khác; pha trộn phiêu lưu/ma thuật và tình dục.

Isekai · Dị Giới
0 truyện >
Nhân vật sang thế giới khác; pha trộn phiêu lưu/ma thuật và tình dục.

K
Không che
0 truyện >
Kimono
0 truyện >
Kinh Dị
0 truyện >
Kissing
0 truyện >
Hôn môi, thể hiện sự thân mật, khởi đầu cho cảm xúc và khoái cảm.

Kissing · Hôn
0 truyện >
Hôn môi, thể hiện sự thân mật, khởi đầu cho cảm xúc và khoái cảm.

Kuudere
0 truyện >
Kiểu nhân vật bề ngoài cực kỳ lạnh lùng để che giấu cảm xúc bên trong; chỉ mở lòng khi được chinh phục.

Kuudere · Ngoài Lạnh Trong Nóng
0 truyện >
Kiểu nhân vật bề ngoài cực kỳ lạnh lùng để che giấu cảm xúc bên trong; chỉ mở lòng khi được chinh phục.

L
Lactation
0 truyện >
Tiết sữa — nhân vật nữ ra sữa, thường gắn với ngực căng tức, bú mút hoặc vắt sữa.

Lactation · Tiết Sữa
0 truyện >
Tiết sữa — nhân vật nữ ra sữa, thường gắn với ngực căng tức, bú mút hoặc vắt sữa.

Lingerie
0 truyện >
Nhân vật mặc đồ lót gợi cảm như áo ngực, quần lót ren, corset hoặc tất lưới. Tập trung vào yếu tố thị giác, quyến rũ và kích thích.

Lingerie · Đồ Lót Gợi Cảm
0 truyện >
Nhân vật mặc đồ lót gợi cảm như áo ngực, quần lót ren, corset hoặc tất lưới. Tập trung vào yếu tố thị giác, quyến rũ và kích thích.

Lolicon
0 truyện >
Hentai chỉ là sản phẩm của trí tưởng tượng, không phản ánh cách con người thực sự cư xử, không phải tài liệu hướng dẫn cuộc sống hay tình dục. Hãy xem hentai như xem phim viễn tưởng: xem nhưng đừng nhầm lẫn với thực tế.

M
Maids
0 truyện >
Maids · Hầu Gái
0 truyện >
Males only
0 truyện >
Chỉ có các nhân vật nam xuất hiện, tạo bối cảnh đồng giới nam.

Males only · Chỉ Có Nam
0 truyện >
Chỉ có các nhân vật nam xuất hiện, tạo bối cảnh đồng giới nam.

Manga
0 truyện >
Manhua
0 truyện >
Manhwa
0 truyện >
Truyện tranh Hàn Quốc; nét vẽ mượt, hiện đại hoặc giả tưởng; hấp dẫn.

Manhwa 18+
8 truyện >
Masturbation
0 truyện >
Nhân vật tự kích thích bản thân bằng tay hoặc đồ chơi tình dục, thể hiện sự tò mò, cô đơn hoặc ham muốn dồn nén.

Masturbation · Tự Sướng
0 truyện >
Nhân vật tự kích thích bản thân bằng tay hoặc đồ chơi tình dục, thể hiện sự tò mò, cô đơn hoặc ham muốn dồn nén.

Mature
0 truyện >
Nhân vật trưởng thành, giàu kinh nghiệm, toát lên nét quyến rũ chín muồi.

Mature · Trưởng Thành
0 truyện >
Nhân vật trưởng thành, giàu kinh nghiệm, toát lên nét quyến rũ chín muồi.

Mermaid
0 truyện >
Nhân vật nữ người cá, kết hợp yếu tố giả tưởng dưới nước đầy mê hoặc.

Mermaid · Tiên Cá
0 truyện >
Nhân vật nữ người cá, kết hợp yếu tố giả tưởng dưới nước đầy mê hoặc.

Miko
0 truyện >
Vu nữ giữ đền với trang phục truyền thống, vẻ đẹp thanh khiết nhưng gợi cảm trong bối cảnh tâm linh Nhật Bản.

Miko · Vu Nữ Giữ Đền
0 truyện >
Vu nữ giữ đền với trang phục truyền thống, vẻ đẹp thanh khiết nhưng gợi cảm trong bối cảnh tâm linh Nhật Bản.

Milf
0 truyện >
Phụ nữ trưởng thành, quyến rũ, giàu kinh nghiệm (mẹ kế, cô giáo…).

Milf · Phụ Nữ Đầy Đặn
0 truyện >
Phụ nữ trưởng thành, quyến rũ, giàu kinh nghiệm (mẹ kế, cô giáo…).

Mind Break
0 truyện >
Bị ép đến mức tâm trí vỡ vụn/tẩy não do khoái cảm hay áp lực tâm lý.

Mind Break · Tẩy Não
0 truyện >
Bị ép đến mức tâm trí vỡ vụn/tẩy não do khoái cảm hay áp lực tâm lý.

Mind Control
0 truyện >
Bị thao túng tâm trí bằng ma thuật/thuốc/công nghệ, dẫn đến hành vi ngoài ý muốn.

Mind Control · Thao Túng Tâm Trí
0 truyện >
Bị thao túng tâm trí bằng ma thuật/thuốc/công nghệ, dẫn đến hành vi ngoài ý muốn.

Monster
0 truyện >
Monster · Quái Vật
0 truyện >
Monstergirl
0 truyện >
Nhân vật nữ mang đặc điểm quái vật (sừng, đuôi…), vừa dị thường vừa quyến rũ.

Monstergirl · Nữ Quái Vật
0 truyện >
Nhân vật nữ mang đặc điểm quái vật (sừng, đuôi…), vừa dị thường vừa quyến rũ.

Mother
0 truyện >
N
NTR
0 truyện >
Nhân vật chính bị cắm sừng – người yêu/vợ bị người khác chiếm đoạt.

Nakadashi
0 truyện >
Nakadashi · Xuất Trong
0 truyện >
Netori
0 truyện >
Ngôn Tình
1 truyện >
Tác phẩm dành riêng cho độc giả trưởng thành, nội dung nhạy cảm.

Ngọt
0 truyện >
Nội dung ngọt ngào, lãng mạn, nhẹ nhàng (sweet/romance).

Nipple Play
0 truyện >
Tập trung kích thích đầu ngực: mút, véo, dùng đồ chơi hoặc quan hệ trực tiếp với đầu ngực.

Nipple Play · Chơi Đầu Ngực
0 truyện >
Tập trung kích thích đầu ngực: mút, véo, dùng đồ chơi hoặc quan hệ trực tiếp với đầu ngực.

Non-hen
0 truyện >
Nun
0 truyện >
Nun · Nữ Tu
0 truyện >
Nurse
0 truyện >
Nurse · Y Tá
0 truyện >
O
Office Lady
0 truyện >
Nhân vật nữ công sở mặc váy bút chì, áo sơ mi, vest – phong thái trưởng thành, quyến rũ nơi văn phòng.

Office Lady · NV Văn Phòng
0 truyện >
Nhân vật nữ công sở mặc váy bút chì, áo sơ mi, vest – phong thái trưởng thành, quyến rũ nơi văn phòng.

Old Man
0 truyện >
Nhân vật nam lớn tuổi xuất hiện trong các tình huống cấm kỵ hoặc gây tò mò.

Old Man · Ông Già
0 truyện >
Nhân vật nam lớn tuổi xuất hiện trong các tình huống cấm kỵ hoặc gây tò mò.

One Shot
0 truyện >
Oneshot
0 truyện >
Oneshot · Chương Đơn
0 truyện >
Truyện ngắn chỉ trong một chương, tập trung vào một tình huống tình dục cụ thể, không có cốt truyện dài dòng.

Oral
0 truyện >
Quan hệ bằng miệng, tập trung mô tả kỹ thuật và khoái cảm trực tiếp.

Osananajimi
0 truyện >
Bạn thuở nhỏ gắn bó từ lâu, mối quan hệ chuyển dần sang lãng mạn hoặc tình dục.

Osananajimi · Bạn Thuở Nhỏ
0 truyện >
Bạn thuở nhỏ gắn bó từ lâu, mối quan hệ chuyển dần sang lãng mạn hoặc tình dục.

P
Paizuri
0 truyện >
Quan hệ tình dục với ngực (ép dương vật giữa bầu ngực để kích thích và đạt cực khoái).

Pantyhose
0 truyện >
Nhân vật mặc quần tất mỏng, tôn đôi chân; thường rách/kéo xuống để tăng sự gợi cảm.

Pantyhose · Quần Tất
0 truyện >
Nhân vật mặc quần tất mỏng, tôn đôi chân; thường rách/kéo xuống để tăng sự gợi cảm.

Pegging
0 truyện >
Nữ dùng đồ chơi đeo để quan hệ qua hậu môn với nam, đảo ngược vai trò truyền thống.

Phiêu Lưu
0 truyện >
Piercing
0 truyện >
Khuyên trên cơ thể (môi, lưỡi, ngực…) tạo hình tượng nổi loạn và gợi cảm.

Piercing · Xỏ Khuyên
0 truyện >
Khuyên trên cơ thể (môi, lưỡi, ngực…) tạo hình tượng nổi loạn và gợi cảm.

Police
0 truyện >
Nhân vật cảnh sát đồng phục, mang hình ảnh quyền lực, kiểm soát; đôi khi kết hợp yếu tố hành động.

Police · Cảnh Sát
0 truyện >
Nhân vật cảnh sát đồng phục, mang hình ảnh quyền lực, kiểm soát; đôi khi kết hợp yếu tố hành động.

Ponytail
0 truyện >
Nhân vật buộc tóc đuôi ngựa, thể hiện sự năng động, khỏe khoắn và quyến rũ.

Ponytail · Tóc Đuôi Ngựa
0 truyện >
Nhân vật buộc tóc đuôi ngựa, thể hiện sự năng động, khỏe khoắn và quyến rũ.

Pregnant
0 truyện >
Princess
0 truyện >
Princess · Công Chúa
0 truyện >
Prostitution
0 truyện >
Quan hệ tình dục để đổi lấy tiền: gái gọi, nhà thổ, bán dâm nghiệp dư.

Prostitution · Mại Dâm
0 truyện >
Quan hệ tình dục để đổi lấy tiền: gái gọi, nhà thổ, bán dâm nghiệp dư.

R
Rape
0 truyện >
Rape · Cưỡng Bức
0 truyện >
Rimjob
0 truyện >
Kích thích hậu môn bằng miệng, trải nghiệm táo bạo và cảm giác lạ.

Romance
0 truyện >
Tình dục gắn liền với tình yêu, đồng thuận, nhiều cảm xúc, không bạo lực.

Romance · Tình Cảm
0 truyện >
Tình dục gắn liền với tình yêu, đồng thuận, nhiều cảm xúc, không bạo lực.

Ryona
0 truyện >
Nhân vật chịu đau đớn thể xác kết hợp yếu tố tình dục gây sốc và căng thẳng.

S
Scat
0 truyện >
Nội dung liên quan đến phân – yếu tố cực đoan, gây tranh cãi và kén người xem.

School uniform
0 truyện >
School uniform · Đồng Phục
0 truyện >
SchoolGirl
0 truyện >
Nữ sinh 16–18 tuổi, đồng phục váy ngắn, bối cảnh trường/ký túc xá/thư viện.

SchoolGirl · Nữ Sinh
0 truyện >
Nữ sinh 16–18 tuổi, đồng phục váy ngắn, bối cảnh trường/ký túc xá/thư viện.

See-through
0 truyện >
Quần áo ướt, mỏng hoặc xuyên thấu làm lộ cơ thể bên trong.

See-through · Xuyên Thấu
0 truyện >
Quần áo ướt, mỏng hoặc xuyên thấu làm lộ cơ thể bên trong.

Series
0 truyện >
Sex Toys
0 truyện >
Sex Toys · Đồ Chơi
0 truyện >
Shimapan
0 truyện >
Quần lót sọc dễ thương, thường dùng trong bối cảnh học đường hài hước hoặc gợi cảm.

Shimapan · Quần Sọc
0 truyện >
Quần lót sọc dễ thương, thường dùng trong bối cảnh học đường hài hước hoặc gợi cảm.

Short
0 truyện >
Truyện ngắn hoặc one-shot chỉ có một chương, tập trung vào một tình huống tình dục duy nhất, diễn biến nhanh và trực tiếp.

Short · Truyện Ngắn
0 truyện >
Truyện ngắn hoặc one-shot chỉ có một chương, tập trung vào một tình huống tình dục duy nhất, diễn biến nhanh và trực tiếp.

Shota
0 truyện >
Shoujo
0 truyện >
Phong cách hướng tới nữ trẻ: cảm xúc lãng mạn, nhẹ nhàng, giàu biểu cảm.

Siscon
0 truyện >
Sister
0 truyện >
Sixty-Nine
0 truyện >
Tư thế hai người đồng thời kích thích nhau bằng miệng, nhấn mạnh sự tương hỗ.

Sixty-Nine · 69
0 truyện >
Tư thế hai người đồng thời kích thích nhau bằng miệng, nhấn mạnh sự tương hỗ.

Slave
0 truyện >
Slave · Nô Lệ
0 truyện >
Sleeping
0 truyện >
Trong Giấc Ngủ

Sleeping · Trong Giấc Ngủ
0 truyện >
Small Boobs
0 truyện >
Small Boobs · Ngực Nhỏ
0 truyện >
Soft Incest
0 truyện >
Quan hệ/tình cảm họ hàng xa (anh họ–em họ, con riêng–mẹ kế…), không huyết thống trực tiếp.

Soft Incest · Loạn Luân Nhẹ
0 truyện >
Quan hệ/tình cảm họ hàng xa (anh họ–em họ, con riêng–mẹ kế…), không huyết thống trực tiếp.

Son
0 truyện >
Son · Con Trai
0 truyện >
Spanking
0 truyện >
Đánh mông tạo cảm giác đau nhẹ xen khoái cảm và phục tùng.

Spanking · Đánh Đít
0 truyện >
Đánh mông tạo cảm giác đau nhẹ xen khoái cảm và phục tùng.

Sport
0 truyện >
Sport · Thể Thao
0 truyện >
Squirting
0 truyện >
Nữ đạt cực khoái phun nước mạnh mẽ, nhấn mạnh sự mãnh liệt và chân thực.

Stockings
0 truyện >
Stockings · Quần Tất
0 truyện >
Strap-on
0 truyện >
Dùng đồ chơi đeo (dương vật giả) để chủ động quan hệ với đối phương.

Succubus
0 truyện >
Nhân vật là nữ quỷ dâm dục chuyên quyến rũ đàn ông để hút sinh lực, mang vẻ đẹp ma mị, chủ động và tràn đầy dục vọng.

Succubus · Nữ Quỷ Hút Tinh
0 truyện >
Nhân vật là nữ quỷ dâm dục chuyên quyến rũ đàn ông để hút sinh lực, mang vẻ đẹp ma mị, chủ động và tràn đầy dục vọng.

Supernatural
0 truyện >
Kết hợp yếu tố siêu nhiên như ma quỷ, phép thuật, thần linh hoặc năng lực đặc biệt với tình dục, tạo không khí huyền bí và kích thích.

Supernatural · Siêu Nhiên
0 truyện >
Kết hợp yếu tố siêu nhiên như ma quỷ, phép thuật, thần linh hoặc năng lực đặc biệt với tình dục, tạo không khí huyền bí và kích thích.

Sweating
0 truyện >
Chảy mồ hôi nhiều; trong cảnh quan hệ nhấn mạnh cơ thể ướt át, hơi thở gấp và cao trào mãnh liệt.

Sweating · Đổ Mồ Hôi
0 truyện >
Chảy mồ hôi nhiều; trong cảnh quan hệ nhấn mạnh cơ thể ướt át, hơi thở gấp và cao trào mãnh liệt.

Swimsuit
0 truyện >
Đồ bơi (bikini/one-piece) ở bãi biển/hồ bơi; gợi cảm trẻ trung.

Swimsuit · Đồ Bơi
0 truyện >
Đồ bơi (bikini/one-piece) ở bãi biển/hồ bơi; gợi cảm trẻ trung.

T
Tail plug
0 truyện >
Đồ chơi hình đuôi thú gắn vào cơ thể, tạo nét hoang dã và gợi cảm.

Tail plug · Gắn Đuôi Thú
0 truyện >
Đồ chơi hình đuôi thú gắn vào cơ thể, tạo nét hoang dã và gợi cảm.

Tall Girl
0 truyện >
Gái cao ráo, chân dài; thường có chiều cao vượt nam chính, tạo cảm giác áp đảo và quyến rũ.

Tall Girl · Gái Cao Lớn
0 truyện >
Gái cao ráo, chân dài; thường có chiều cao vượt nam chính, tạo cảm giác áp đảo và quyến rũ.

Teacher
0 truyện >
Teacher · Giáo Viên
0 truyện >
Tentacles
0 truyện >
Tentacles · Xúc Tu
0 truyện >
Threesome
0 truyện >
Cảnh quan hệ giữa ba người (thường là hai nữ một nam hoặc ngược lại), nhấn mạnh cảm giác đa chiều, ghen tuông nhẹ và khoái cảm mạnh mẽ.

Threesome · Ba Người
0 truyện >
Cảnh quan hệ giữa ba người (thường là hai nữ một nam hoặc ngược lại), nhấn mạnh cảm giác đa chiều, ghen tuông nhẹ và khoái cảm mạnh mẽ.

Thể Thao
0 truyện >
Time Stop
0 truyện >
Dừng Thời Gian

Time Stop · Dừng Thời Gian
0 truyện >
Tomboy
0 truyện >
Tracksuit
0 truyện >
Nhân vật mặc đồ thể thao bó sát, nhấn mạnh sự khỏe khoắn và đường cong.

Tracksuit · Đồ Thể Thao
0 truyện >
Nhân vật mặc đồ thể thao bó sát, nhấn mạnh sự khỏe khoắn và đường cong.

Transformation
0 truyện >
Nhân vật biến thân sang hình thể khác (ma thuật, công nghệ, lời nguyền...), mang đến trải nghiệm gợi cảm mới lạ.

Transformation · Biến Hình
0 truyện >
Nhân vật biến thân sang hình thể khác (ma thuật, công nghệ, lời nguyền...), mang đến trải nghiệm gợi cảm mới lạ.

Trap
0 truyện >
Nhân vật nam ăn mặc hoặc thể hiện như nữ; ngoại hình và/hoặc tính cách nữ tính tạo nên sự nhập nhằng giới tính gợi cảm.

Trap · Bẫy
0 truyện >
Nhân vật nam ăn mặc hoặc thể hiện như nữ; ngoại hình và/hoặc tính cách nữ tính tạo nên sự nhập nhằng giới tính gợi cảm.

Trinh Thám
0 truyện >
Truyện Màu
5 truyện >
Truyện Việt
0 truyện >
Trọng Sinh
0 truyện >
Tsundere
0 truyện >
Ngoài lạnh trong ấm; tương phản tính cách khi vào cảnh thân mật.

Tsundere · Kiêu Ngạo
0 truyện >
Ngoài lạnh trong ấm; tương phản tính cách khi vào cảnh thân mật.

Tu Tiên
0 truyện >
Thể loại tu luyện/tiên hiệp: luyện công, thăng cấp, thế giới huyền huyễn.

Twins
0 truyện >
Twins · Song Sinh
0 truyện >
Twintails
0 truyện >
Tóc buộc hai bên trẻ trung, thường gắn với tính cách năng động hoặc tsundere nhẹ.

Twintails · Tóc Hai Bím
0 truyện >
Tóc buộc hai bên trẻ trung, thường gắn với tính cách năng động hoặc tsundere nhẹ.

U
Underwater
0 truyện >
Underwater · Dưới Nước
0 truyện >
V
Vampire
0 truyện >
Ma cà rồng quyến rũ, kết hợp yếu tố hút máu và mê hoặc dục tính.

Vampire · Ma Cà Rồng
0 truyện >
Ma cà rồng quyến rũ, kết hợp yếu tố hút máu và mê hoặc dục tính.

Vanilla
0 truyện >
Cảnh sex nhẹ nhàng, đồng thuận; tập trung kết nối cảm xúc.

Vanilla · Tình Cảm Nhẹ Nhàng
0 truyện >
Cảnh sex nhẹ nhàng, đồng thuận; tập trung kết nối cảm xúc.

Virgin
0 truyện >
Virgin · Trinh
0 truyện >
Voyeurism
0 truyện >
Nhìn trộm hoặc quay lén cảnh riêng tư mà đối phương không hay biết.

Voyeurism · Nhìn Trộm
0 truyện >
Nhìn trộm hoặc quay lén cảnh riêng tư mà đối phương không hay biết.

Vtuber
0 truyện >
Nhân vật ảo do streamer điều khiển, xuất hiện trong nội dung gợi cảm hoặc tương tác độc đáo.

Võ Thuật
0 truyện >
W
Watersports
0 truyện >
Nội dung liên quan tới nước tiểu: tiểu tiện, bị tưới lên người hoặc uống.

Watersports · Nước Tiểu
0 truyện >
Nội dung liên quan tới nước tiểu: tiểu tiện, bị tưới lên người hoặc uống.

Webtoon
0 truyện >
Wormhole
0 truyện >
Quan hệ qua cổng không gian hoặc lối xuyên chiều, tăng tính kỳ ảo mới lạ.

X
X-ray
0 truyện >
Y
Yandere
0 truyện >
Yandere · Cuồng Yêu
0 truyện >
Yaoi
0 truyện >
Quan hệ giữa hai nam; có thể lãng mạn/đam mỹ, phổ biến trong cộng đồng BL.

Yaoi · Đam Mỹ
0 truyện >
Quan hệ giữa hai nam; có thể lãng mạn/đam mỹ, phổ biến trong cộng đồng BL.

Yuri
0 truyện >
Quan hệ giữa hai nữ; nhấn mạnh sự lãng mạn/gợi cảm, nhẹ nhàng hoặc mãnh liệt.

Yuri · Bách Hợp
0 truyện >
Quan hệ giữa hai nữ; nhấn mạnh sự lãng mạn/gợi cảm, nhẹ nhàng hoặc mãnh liệt.

Z
Zombie
0 truyện >
Xác sống xuất hiện trong bối cảnh kinh dị, xen yếu tố tình dục kỳ quái hoặc đen tối.

Zombie · Xác Sống
0 truyện >
Xác sống xuất hiện trong bối cảnh kinh dị, xen yếu tố tình dục kỳ quái hoặc đen tối.
"""

try:
    with open(r'C:\Users\Loki\Desktop\sub-agent\project\comic-platform\scripts\vina_genres.json', 'r', encoding='utf-8') as f:
        existing = json.load(f)
except:
    existing = []

existing_names = {g['name'].lower() for g in existing}

lines = [l.strip() for l in prompt_text.split('\n') if l.strip()]
new_genres = []
i = 0
while i < len(lines):
    line = lines[i]
    if (len(line) <= 2 and line.isupper()) or line in ['#', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'K', 'L', 'M', 'N', 'O', 'P', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'VinaHentai', 'Tìm truyện hoặc mã...', 'Nâng cao', 'Namdz', 'Thoát', 'Trang chủ', 'Thể loại', 'BXH', 'Triệu hồi', 'Hoàn thành', 'Random', 'Tủ truyện', 'Tất cả thể loại truyện hentai', 'Tìm kiếm thể loại...']:
        i += 1
        continue
    
    if i + 1 < len(lines) and 'truyện' in lines[i+1]:
        g_name = line
        g_count_text = lines[i+1]
        g_count = re.sub(r'[^0-9]', '', g_count_text)
        g_count_val = int(g_count) if g_count else 0
        
        g_desc = ''
        if i + 2 < len(lines) and 'truyện' not in lines[i+2] and len(lines[i+2]) > 3:
            g_desc = lines[i+2]
            i += 3
        else:
            i += 2
            
        slug = re.sub(r'[^a-z0-9àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]+', '-', g_name.lower()).strip('-')
        if g_name.lower() not in existing_names:
            existing_names.add(g_name.lower())
            new_genres.append({
                'name': g_name,
                'slug': slug,
                'comic_count': g_count_val,
                'description': g_desc
            })
    else:
        if len(line) < 40 and not any(kw in line.lower() for kw in ['truyện', 'http', 'chính sách', 'giới thiệu', 'liên hệ', 'bản quyền']):
            g_name = line
            slug = re.sub(r'[^a-z0-9àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]+', '-', g_name.lower()).strip('-')
            if g_name.lower() not in existing_names:
                existing_names.add(g_name.lower())
                new_genres.append({
                    'name': g_name,
                    'slug': slug,
                    'comic_count': 0,
                    'description': ''
                })
        i += 1

all_genres = existing + new_genres
print(f'Added {len(new_genres)} new genres from prompt user list. Total genres: {len(all_genres)}')
with open(r'C:\Users\Loki\Desktop\sub-agent\project\comic-platform\scripts\vina_genres.json', 'w', encoding='utf-8') as f:
    json.dump(all_genres, f, ensure_ascii=False, indent=2)
