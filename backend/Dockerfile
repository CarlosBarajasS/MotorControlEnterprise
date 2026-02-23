# Etapa de construcción
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copiar csproj y restaurar dependencias
COPY ["backend/MotorControlEnterprise.Api.csproj", "backend/"]
RUN dotnet restore "backend/MotorControlEnterprise.Api.csproj"

# Copiar todo el código fuente y construir
COPY . .
WORKDIR "/src/backend"
RUN dotnet build "MotorControlEnterprise.Api.csproj" -c Release -o /app/build

# Etapa de publicación
FROM build AS publish
RUN dotnet publish "MotorControlEnterprise.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Etapa final (Runtime)
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app

# ffmpeg requerido por StreamRecorderService para grabación de streams
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY --from=publish /app/publish .

# Variables de entorno por defecto (se sobrescriben con docker-compose)
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "MotorControlEnterprise.Api.dll"]
