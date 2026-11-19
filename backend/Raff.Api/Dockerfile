# Build context: ./backend   (docker build -f backend/Raff.Api/Dockerfile backend)

# ---- build: full SDK, restore first so the package layer is cached between code changes
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Raff.Api/Raff.Api.csproj Raff.Api/
RUN dotnet restore Raff.Api/Raff.Api.csproj
COPY Raff.Api/ Raff.Api/
RUN dotnet publish Raff.Api/Raff.Api.csproj -c Release -o /app --no-restore /p:UseAppHost=false

# ---- runtime: ASP.NET runtime only (no SDK), runs as the image's non-root user
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "Raff.Api.dll"]
