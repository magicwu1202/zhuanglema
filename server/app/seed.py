"""首次启动预置常见软件。"""
from .database import get_db

# (name, emoji, tagline, version_source, source_ref, official_url)
SEED_SOFTWARE = [
    ("MySQL", "🐬", "数据库老大哥，装了它你就是 DBA（自封的）", "ai", "", ""),
    ("Node.js", "🟢", "前端同学的命根子", "github", "nodejs/node", ""),
    ("Python", "🐍", "人生苦短，先把它装上", "github", "python/cpython", ""),
    ("Java (JDK)", "☕", "一杯咖啡的时间装好 JDK", "manual", '["25", "21.0.5", "17.0.13", "11.0.25", "8u431"]', ""),
    ("Git", "🌿", "代码后悔药，装了才能反悔", "github", "git/git", ""),
    ("Maven", "🪶", "Java 圈的快递小哥，帮你拉依赖", "github", "apache/maven", ""),
    ("Redis", "🧠", "快到飞起的内存数据库", "github", "redis/redis", ""),
    ("Docker", "🐳", "把环境装进集装箱", "github", "moby/moby", "https://www.docker.com/products/docker-desktop/"),
    ("Nginx", "🚦", "网站门口的交通警察", "github", "nginx/nginx", ""),
    ("Go", "🐹", "谷歌出品的小仓鼠，跑得贼快", "github", "golang/go", ""),
    ("Rust", "🦀", "螃蟹横着走，内存不会漏", "github", "rust-lang/rust", ""),
    ("MongoDB", "🍃", "文档数据库，存 JSON 贼顺手", "github", "mongodb/mongo", ""),
    ("PostgreSQL", "🐘", "学术派数据库大象", "github", "postgres/postgres", ""),
    ("VS Code", "💙", "宇宙第一（轻量）编辑器", "official", "", "https://code.visualstudio.com/download"),
    ("IntelliJ IDEA", "🧡", "Java 同学的梦中情 IDE", "official", "", "https://www.jetbrains.com/idea/download/"),
    ("Homebrew", "🍺", "Mac 上的万能小卖部", "github", "Homebrew/brew", ""),
    ("nvm", "🔀", "Node 版本随便切，再也不打架", "github", "nvm-sh/nvm", ""),
    ("pnpm", "📦", "省磁盘的包管理快手", "npm", "pnpm", ""),
    ("FFmpeg", "🎬", "音视频处理瑞士军刀", "github", "FFmpeg/FFmpeg", ""),
    ("Conda (Miniconda)", "🅒", "Python 环境收纳大师", "official", "", "https://www.anaconda.com/download/success"),
]


def seed_if_empty() -> None:
    with get_db() as db:
        count = db.execute("SELECT COUNT(*) AS c FROM software").fetchone()["c"]
        if count > 0:
            return
        db.executemany(
            "INSERT OR IGNORE INTO software (name, emoji, tagline, version_source, source_ref, official_url) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            SEED_SOFTWARE,
        )
