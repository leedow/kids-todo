import argparse
import getpass
import io
import os

from PIL import Image, ImageDraw
from pydantic import ValidationError
from sqlalchemy import func, select

from app.db.models import Card, CardCategory, CardSet, User
from app.db.session import SessionLocal
from app.modules.auth.service import passwords
from app.modules.cards.service import upload_image

ANIMALS = [
    ("小狐狸", "狐狸的大耳朵能帮助它听见草丛里细小的声音。", "#D59455", "fox"),
    ("小白兔", "兔子用有力的后腿跳跃，长耳朵还能帮助散热。", "#E9DAD2", "rabbit"),
    ("小棕熊", "熊的嗅觉很灵敏，能帮助它找到森林里的食物。", "#A57A57", "bear"),
    ("大熊猫", "大熊猫的主要食物是竹子，它每天花很多时间进食。", "#596861", "panda"),
    ("小花猫", "猫的胡须可以帮助它感知周围物体的位置。", "#C6A778", "cat"),
    ("小狮子", "狮子常常群居，成年雄狮通常有浓密的鬃毛。", "#DAAE5C", "lion"),
    ("小考拉", "考拉生活在树上，大部分时间都在休息。", "#A2AAA0", "koala"),
    ("小老虎", "每只老虎身上的条纹都不完全相同。", "#DE9B4E", "tiger"),
    ("小绵羊", "绵羊是群居动物，常常和伙伴们一起行动。", "#E6DBBF", "sheep"),
    ("小浣熊", "浣熊灵巧的前爪能帮助它探索和寻找食物。", "#9B9F95", "raccoon"),
    ("小青蛙", "青蛙从蝌蚪长大，经历从水中到陆地的变化。", "#9BB87B", "frog"),
    ("小鹿", "鹿是草食动物，灵敏的耳朵能帮助它察觉周围动静。", "#C9A079", "deer"),
]


def animal_image(color: str, kind: str) -> bytes:
    """Original geometric illustrations, generated locally without external assets."""
    image = Image.new("RGB", (600, 720), "#EDF0DF")
    d = ImageDraw.Draw(image)
    d.rounded_rectangle((24, 24, 576, 696), radius=32, outline="#D1D9C5", width=2)
    d.ellipse((80, 110, 520, 550), fill="#E1E8CC")
    d.ellipse((117, 517, 487, 557), fill="#CDD9B8")
    for x, y, r in [(95, 82, 6), (501, 105, 5), (79, 380, 4), (514, 438, 5)]:
        d.line((x - r, y, x + r, y), fill="#B4BD95", width=3)
        d.line((x, y - r, x, y + r), fill="#B4BD95", width=3)
    d.ellipse((194, 363, 411, 565), fill=color)
    if kind == "rabbit":
        d.rounded_rectangle((193, 115, 263, 326), radius=34, fill=color)
        d.rounded_rectangle((335, 105, 405, 320), radius=34, fill=color)
        d.rounded_rectangle((214, 136, 242, 285), radius=14, fill="#DCB4A7")
        d.rounded_rectangle((356, 127, 384, 280), radius=14, fill="#DCB4A7")
    elif kind in {"cat", "fox", "deer"}:
        d.polygon([(163, 320), (165, 161), (285, 269)], fill=color)
        d.polygon([(319, 269), (432, 161), (435, 320)], fill=color)
        d.polygon([(181, 270), (183, 194), (246, 268)], fill="#EABAA3")
        d.polygon([(353, 268), (414, 194), (416, 270)], fill="#EABAA3")
    elif kind == "frog":
        d.ellipse((154, 221, 257, 332), fill=color)
        d.ellipse((343, 221, 446, 332), fill=color)
    else:
        for x in (161, 350):
            d.ellipse((x, 211, x + 91, 312), fill="#5E6B5B" if kind == "panda" else color)
            d.ellipse((x + 17, 230, x + 74, 287), fill="#DAB7A0")
    if kind == "lion":
        for x, y in [
            (173, 254),
            (240, 220),
            (310, 221),
            (377, 254),
            (398, 333),
            (358, 398),
            (222, 401),
            (156, 332),
        ]:
            d.ellipse((x - 48, y - 48, x + 48, y + 48), fill="#B98241")
    d.ellipse((148, 254, 451, 477), fill="#F0E5CF" if kind == "panda" else color)
    if kind in {"panda", "raccoon"}:
        for x in (207, 332):
            d.ellipse((x - 29, 326, x + 29, 391), fill="#59685D")
    if kind in {"fox", "cat", "deer"}:
        d.ellipse((177, 351, 422, 470), fill="#F1E4CB")
    if kind == "sheep":
        for x, y in [(160, 289), (215, 258), (275, 249), (334, 258), (394, 289)]:
            d.ellipse((x - 35, y - 35, x + 45, y + 45), fill="#F5F0E1")
    for x in (235, 362):
        d.ellipse((x - 7, 353, x + 7, 369), fill="#354C3E")
        d.ellipse((x - 4, 354, x, 358), fill="#FFFFFF")
    d.ellipse((290, 389, 310, 402), fill="#5B5947")
    d.arc((284, 395, 300, 416), 0, 140, fill="#5B5947", width=3)
    d.arc((300, 395, 316, 416), 40, 180, fill="#5B5947", width=3)
    for x in (207, 383):
        d.ellipse((x - 16, 388, x + 16, 402), fill="#DCA292")
    if kind == "tiger":
        for x in (270, 300, 330):
            d.polygon([(x - 5, 264), (x + 5, 264), (x, 309)], fill="#6C6751")
    if kind == "deer":
        for x, y in [(220, 308), (260, 290), (300, 285), (340, 290), (378, 309)]:
            d.ellipse((x - 6, y - 6, x + 6, y + 6), fill="#F5E9CF")
    for x in (119, 464):
        d.line((x, 598, x, 545), fill="#8C9F70", width=5)
        d.ellipse((x - 24, 551, x, 574), fill="#A8B789")
        d.ellipse((x, 536, x + 24, 560), fill="#A8B789")
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def seed_cards(db):
    category = db.scalar(select(CardCategory).where(CardCategory.name == "自然小伙伴"))
    if not category:
        category = CardCategory(name="自然小伙伴")
        db.add(category)
        db.flush()
    card_set = db.scalar(
        select(CardSet).where(CardSet.category_id == category.id, CardSet.name == "森林朋友")
    )
    if not card_set:
        card_set = CardSet(
            category_id=category.id, name="森林朋友", description="走进森林，认识十二位可爱的小伙伴。"
        )
        db.add(card_set)
        db.flush()
    for index, (name, description, color, kind) in enumerate(ANIMALS):
        if db.scalar(select(Card.id).where(Card.set_id == card_set.id, Card.name == name)):
            continue
        asset = upload_image(db, animal_image(color, kind))
        rarity = "legendary" if index == 11 else "epic" if index >= 9 else "rare" if index >= 5 else "common"
        db.add(
            Card(
                set_id=card_set.id,
                name=name,
                description=description,
                image_asset_id=asset["id"],
                rarity=rarity,
                draw_weight={"common": 10, "rare": 6, "epic": 3, "legendary": 1}[rarity],
                sort_order=index,
            )
        )
    db.flush()


def main():
    parser = argparse.ArgumentParser(description="小小成长家维护工具")
    commands = parser.add_subparsers(dest="command", required=True)
    admin = commands.add_parser("create-admin", help="创建管理员，无默认密码")
    admin.add_argument("--username", required=True)
    admin.add_argument("--name", default="应用管理员")
    admin.add_argument("--password-env", help="从指定环境变量读取密码，否则安全交互输入")
    commands.add_parser("seed-cards", help="幂等导入12张原创示例卡")
    commands.add_parser("rebuild-collection", help="由获得记录重建收藏汇总")
    args = parser.parse_args()
    with SessionLocal.begin() as db:
        if args.command == "create-admin":
            from app.modules.admin.schema import UserInput

            password = (
                os.environ.get(args.password_env, "")
                if args.password_env
                else getpass.getpass("管理员密码：")
            )
            try:
                value = UserInput(username=args.username, display_name=args.name, password=password)
            except ValidationError:
                parser.error("请检查用户名（3～40位）、昵称（1～40字）和密码（8～128位）")
            if db.scalar(select(User.id).where(func.lower(User.username) == value.username.lower())):
                parser.error("用户名已存在")
            db.add(
                User(
                    username=value.username.lower(),
                    display_name=value.display_name,
                    password_hash=passwords.hash(password),
                    role="admin",
                )
            )
            print("管理员已创建。")
        elif args.command == "seed-cards":
            seed_cards(db)
            print("原创示例卡已准备完成。")
        else:
            # Maintenance runs while writes are stopped; explicit table locks ensure
            # a concurrent grant cannot get lost during reconstruction.
            from sqlalchemy import delete, text

            from app.db.models import Acquisition, UserCard

            db.execute(text("LOCK TABLE card_acquisition_records, user_cards IN EXCLUSIVE MODE"))
            db.execute(delete(UserCard))
            for user_id, card_id, count, first, last in db.execute(
                select(
                    Acquisition.user_id,
                    Acquisition.card_id,
                    func.count(),
                    func.min(Acquisition.acquired_at),
                    func.max(Acquisition.acquired_at),
                ).group_by(Acquisition.user_id, Acquisition.card_id)
            ):
                db.add(
                    UserCard(
                        user_id=user_id,
                        card_id=card_id,
                        quantity=count,
                        first_acquired_at=first,
                        last_acquired_at=last,
                    )
                )
            print("收藏汇总已重建。")


if __name__ == "__main__":
    main()
