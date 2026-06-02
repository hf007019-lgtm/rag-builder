import os


def disable_proxy_for_localhost():
    os.environ["NO_PROXY"] = "127.0.0.1,localhost,0.0.0.0"
    os.environ["no_proxy"] = "127.0.0.1,localhost,0.0.0.0"