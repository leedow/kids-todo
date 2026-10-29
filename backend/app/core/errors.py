class AppError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code = code
        self.message = message
        self.status = status


def missing():
    raise AppError("NOT_FOUND", "找不到这条记录", 404)
