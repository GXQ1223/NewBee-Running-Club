"""
Seed the LOCAL dev database (SQLite) with realistic demo data so the
redesigned frontend can be previewed end-to-end.

Idempotent: each table is only seeded if it is currently empty.
Never run against production (guarded by USE_SQLITE).

Usage:
    source venv/bin/activate && python seed_demo_data.py
"""
import os
from datetime import date, datetime

from dotenv import load_dotenv

load_dotenv()

if os.getenv('USE_SQLITE', 'True').lower() != 'true':
    raise SystemExit('Refusing to seed: USE_SQLITE is not True (this script is for the local dev DB only).')

from database import (  # noqa: E402
    SessionLocal, Event, HomepageSection, Donor, Results, TrainingTip, ClubRuleVersion,
)

IMG = '/images/2025'

EVENTS = [
    # Past highlights — these feed the homepage carousel + Latest Events panel
    dict(name='NYRR Team Championships', chinese_name='团队锦标赛',
         date=date(2025, 7, 27), time='8:00 AM', location='Central Park',
         chinese_location='中央公园',
         description='Representing NewBee at the NYRR Team Championships.',
         chinese_description='新蜂代表队出战NYRR团队锦标赛。',
         image=f'{IMG}/20250727_team_champ.jpg', status='Past', is_highlight=True),
    dict(name='Queens 10K', chinese_name='皇后区10公里',
         date=date(2025, 6, 20), time='7:45 AM', location='Flushing Meadows Corona Park',
         chinese_location='法拉盛草原可乐娜公园',
         description='NYRR Queens 10K race day with the NewBee crew.',
         chinese_description='与新蜂小伙伴一起参加皇后区10公里。',
         image=f'{IMG}/20250620_queens_10k.jpg', status='Past', is_highlight=True),
    dict(name='9th Anniversary Run', chinese_name='九周年纪念跑',
         date=date(2025, 6, 4), time='6:30 PM', location='Central Park',
         chinese_location='中央公园',
         description='Celebrating 9 years of NewBee Running Club!',
         chinese_description='庆祝新蜂跑团成立九周年！',
         image=f'{IMG}/20250604_9th_anniversary_run.jpg', status='Past', is_highlight=True),
    dict(name='Brooklyn Half Marathon', chinese_name='布鲁克林半程马拉松',
         date=date(2025, 5, 17), time='7:00 AM', location='Prospect Park to Coney Island',
         chinese_location='展望公园至康尼岛',
         description='RBC Brooklyn Half — biggest half marathon in the US.',
         chinese_description='RBC布鲁克林半马——全美最大规模半马。',
         image=f'{IMG}/20250517_bk_half.jpg', status='Past', is_highlight=True),
    dict(name='Brooklyn Half Preview Run', chinese_name='布鲁克林半马预热跑',
         date=date(2025, 5, 3), time='7:30 AM', location='Prospect Park',
         chinese_location='展望公园',
         description='Course preview run ahead of the Brooklyn Half.',
         chinese_description='布鲁克林半马赛道预热团跑。',
         image=f'{IMG}/20250503_bk_half_preview_run.jpg', status='Past', is_highlight=True),
    # Upcoming — these feed the Event Registration card cycling + calendar
    dict(name='Sunday Long Run', chinese_name='周日长跑',
         date=date(2026, 7, 19), time='7:00 AM', location='Central Park',
         chinese_location='中央公园',
         description='Weekly Sunday long run, all paces welcome.',
         chinese_description='每周日长跑，欢迎所有配速的跑者。',
         image=f'{IMG}/20250604_9th_anniversary_run.jpg', status='Upcoming',
         signup_link='https://example.com/signup/sunday-long-run'),
    dict(name='NYRR Team Championships 2026', chinese_name='2026团队锦标赛',
         date=date(2026, 7, 26), time='8:00 AM', location='Central Park',
         chinese_location='中央公园',
         description='Team Champs is back — race for NewBee!',
         chinese_description='团队锦标赛回归——为新蜂而战！',
         image=f'{IMG}/20250727_team_champ.jpg', status='Upcoming',
         signup_link='https://example.com/signup/team-champs-2026'),
    dict(name='Summer Track Workout', chinese_name='夏季场地训练',
         date=date(2026, 8, 2), time='6:30 PM', location='McCarren Park Track',
         chinese_location='麦卡伦公园田径场',
         description='Coached interval session on the track.',
         chinese_description='教练带队的场地间歇训练。',
         image=f'{IMG}/20250503_bk_half_preview_run.jpg', status='Upcoming',
         signup_link='https://example.com/signup/summer-track'),
]

SECTIONS = [
    dict(title_en='Event Registration', title_cn='活动报名', link_path='/calendar',
         image_url='/EventRegistration.png', display_order=1),
    dict(title_en='Memories', title_cn='回忆', link_path='/highlights',
         image_url='/Highlights.png', display_order=2),
    dict(title_en='Upcoming', title_cn='即将到来', link_path='/calendar',
         image_url=f'{IMG}/20250517_bk_half.jpg', display_order=3),
    dict(title_en='Club Credits/Records', title_cn='俱乐部积分/记录', link_path='/records',
         image_url=f'{IMG}/20250620_queens_10k.jpg', display_order=4),
    dict(title_en='Join NewBee', title_cn='加入新蜂', link_path='/join',
         image_url='/AboutUs.png', display_order=5),
    # Training tile intentionally omitted — the page is hidden on prod
    dict(title_en='Donors', title_cn='捐赠者', link_path='/sponsors',
         image_url=f'{IMG}/20250503_bk_half_preview_run.jpg', display_order=6),
]

DONORS = [
    dict(donor_id='D001', name='Golden Wheat Bakery', donor_type='enterprise',
         donation_event='9th Anniversary', amount=800, donation_date=date(2025, 6, 1),
         source='WeChat', receipt_confirmed=True),
    dict(donor_id='D002', name='East River Sports', donor_type='enterprise',
         donation_event='General Support', amount=500, donation_date=date(2025, 4, 12),
         source='Check', receipt_confirmed=True),
    dict(donor_id='D003', name='Wei Zhang', donor_type='individual',
         donation_event='Brooklyn Half Cheer Zone', amount=120, donation_date=date(2025, 5, 10),
         source='Venmo', receipt_confirmed=True),
    dict(donor_id='D004', name='Anonymous Runner', donor_type='individual',
         donation_event='General Support', amount=88, donation_date=date(2025, 7, 1),
         source='Zelle', receipt_confirmed=False, hide_name=True),
    dict(donor_id='D005', name='Li Chen', donor_type='individual',
         donation_event='9th Anniversary', amount=200, donation_date=date(2025, 6, 4),
         source='Venmo', receipt_confirmed=True),
]

RESULTS = [
    # Brooklyn Half 2025
    dict(name='Brandon Shen', gender_age='M32', overall_place=412, gender_place=380,
         overall_time='1:21:44', pace='06:14', gun_time='1:22:01', age_graded_time='1:20:10',
         race='Brooklyn Half Marathon', race_time=datetime(2025, 5, 17, 7, 0), race_distance='Half Marathon', iaaf='USA'),
    dict(name='Shawn Tian', gender_age='M29', overall_place=655, gender_place=601,
         overall_time='1:24:31', pace='06:27', gun_time='1:24:50', age_graded_time='1:24:05',
         race='Brooklyn Half Marathon', race_time=datetime(2025, 5, 17, 7, 0), race_distance='Half Marathon', iaaf='CHN'),
    dict(name='Tiffany Qiu', gender_age='F28', overall_place=1804, gender_place=402,
         overall_time='1:33:12', pace='07:07', gun_time='1:33:30', age_graded_time='1:32:40',
         race='Brooklyn Half Marathon', race_time=datetime(2025, 5, 17, 7, 0), race_distance='Half Marathon', iaaf='CHN'),
    dict(name='Caroline Wang', gender_age='F31', overall_place=2210, gender_place=520,
         overall_time='1:35:58', pace='07:20', gun_time='1:36:15', age_graded_time='1:35:02',
         race='Brooklyn Half Marathon', race_time=datetime(2025, 5, 17, 7, 0), race_distance='Half Marathon', iaaf='USA'),
    dict(name='Miles Guo', gender_age='M27', overall_place=903, gender_place=821,
         overall_time='1:26:47', pace='06:38', gun_time='1:27:05', age_graded_time='1:26:30',
         race='Brooklyn Half Marathon', race_time=datetime(2025, 5, 17, 7, 0), race_distance='Half Marathon', iaaf='CHN'),
    # Queens 10K 2025
    dict(name='Brandon Shen', gender_age='M32', overall_place=201, gender_place=188,
         overall_time='0:37:02', pace='05:58', gun_time='0:37:12', age_graded_time='0:36:30',
         race='Queens 10K', race_time=datetime(2025, 6, 20, 7, 45), race_distance='10K', iaaf='USA'),
    dict(name='Ciping Wu', gender_age='M35', overall_place=410, gender_place=372,
         overall_time='0:39:21', pace='06:20', gun_time='0:39:33', age_graded_time='0:38:22',
         race='Queens 10K', race_time=datetime(2025, 6, 20, 7, 45), race_distance='10K', iaaf='CHN'),
    dict(name='Nian Zhao', gender_age='F30', overall_place=980, gender_place=210,
         overall_time='0:43:15', pace='06:58', gun_time='0:43:28', age_graded_time='0:42:50',
         race='Queens 10K', race_time=datetime(2025, 6, 20, 7, 45), race_distance='10K', iaaf='CHN'),
    dict(name='Yue Ma', gender_age='F34', overall_place=1105, gender_place=245,
         overall_time='0:44:02', pace='07:05', gun_time='0:44:15', age_graded_time='0:43:12',
         race='Queens 10K', race_time=datetime(2025, 6, 20, 7, 45), race_distance='10K', iaaf='CHN'),
    dict(name='Junxiao Yi', gender_age='M38', overall_place=350, gender_place=322,
         overall_time='0:38:44', pace='06:14', gun_time='0:38:55', age_graded_time='0:37:20',
         race='Queens 10K', race_time=datetime(2025, 6, 20, 7, 45), race_distance='10K', iaaf='CHN'),
]

RULE_VERSIONS = [
    dict(year_label='2025', title='2025 年赛事规则', is_current=True,
         created_by='新蜂跑团管理组',
         content=(
             '<p>为了鼓励更多跑友代表新蜂跑团参与 NYRR 官方赛事，新蜂跑团获得了本次 4 个 '
             'NYRR Club Entry 名额。现公布名额申请与分配规则如下</p>'
             '<h3>一、什么是 Club Entry？</h3>'
             '<ul><li>无需抽签、直接参赛</li><li>需要由跑团统一提交报名信息</li>'
             '<li>属于跑团整体参赛配额的一部分</li></ul>'
             '<h3>二、基本原则</h3>'
             '<ul><li><strong>确保参赛，不浪费名额</strong></li>'
             '<li><strong>公开透明，兼顾多元考量</strong></li>'
             '<li><strong>鼓励轮换，优先未曾获名额者</strong></li></ul>'
             '<h3>三、分配规则与说明</h3>'
             '<p>每次比赛共分配 4 个名额，优先考虑过去 6 个月内未获得过名额的成员。</p>'
             '<h3>四、报名方式</h3>'
             '<p>发送 Legal Name、NYRR 注册邮箱、是否曾获得 Club Entry、Heylo 昵称至 '
             'newbeerunningclub@gmail.com。</p>'
         )),
    dict(year_label='2024', title='2024 年赛事规则', is_current=False,
         created_by='新蜂跑团管理组',
         content=(
             '<p>（2024 年版本规则存档）本年度共 3 个 Club Entry 名额，'
             '分配以年度积分榜为主要依据，冷冻期为 3 个月。</p>'
         )),
]

TIPS = [
    dict(category='recovery', title='Sleep is your best recovery tool',
         content='Aim for 7-9 hours, especially after long runs. Consistency beats everything else.',
         author_name='Miles Guo', status='approved'),
    dict(category='technique', title='Cadence over stride length',
         content='Aim for ~170-180 steps per minute to reduce overstriding and impact.',
         author_name='Brandon Shen', status='approved'),
    dict(category='nutrition', title='Fuel before the long run',
         content='Eat a carb-focused breakfast 90 minutes before your Sunday long run.',
         author_name='Tiffany Qiu', status='approved'),
]


def seed(db, model, rows, label, **extra):
    if db.query(model).count() > 0:
        print(f'  {label}: already has data, skipped')
        return
    for row in rows:
        db.add(model(**row, **extra))
    db.commit()
    print(f'  {label}: seeded {len(rows)} rows')


def main():
    db = SessionLocal()
    try:
        print('Seeding local dev database...')
        seed(db, Event, EVENTS, 'events')
        seed(db, HomepageSection, SECTIONS, 'homepage_sections')
        seed(db, Donor, DONORS, 'donors')
        seed(db, ClubRuleVersion, RULE_VERSIONS, 'club_rule_versions')
        seed(db, Results, RESULTS, 'results')
        try:
            seed(db, TrainingTip, TIPS, 'training_tips')
        except Exception as e:
            db.rollback()
            print(f'  training_tips: skipped ({e})')
        print('Done.')
    finally:
        db.close()


if __name__ == '__main__':
    main()
