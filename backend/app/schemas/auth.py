from pydantic import BaseModel, EmailStr, Field


class UsersModel(BaseModel):

    username:str = Field(min_length=3, max_length=50)
    password:str = Field(min_length=8, max_length=128)
    email:EmailStr = Field(max_length=50)  # users.email is String(50)


class RefreshTokenModel(BaseModel):

    refresh_token:str = Field()
