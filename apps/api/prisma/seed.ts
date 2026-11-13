import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { DEFAULT_WORKFLOW } from '@terreno/shared';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando seed de demostración para TerrenoCNR...');

  // 1. Roles institucionales
  const adminRole = await prisma.role.upsert({
    where: { key: 'admin' },
    update: {},
    create: {
      key: 'admin',
      name: 'Administrador del Sistema',
      description: 'Acceso total y configuración de la plataforma',
      permissions: ['*'],
      system: true,
    },
  });

  const supervisorRole = await prisma.role.upsert({
    where: { key: 'supervisor' },
    update: {},
    create: {
      key: 'supervisor',
      name: 'Supervisor de Área / Jefatura',
      description: 'Asignación, revisión y aprobación de inspecciones',
      permissions: [
        'activities.read.all',
        'activities.create',
        'activities.write',
        'activities.assign',
        'activities.approve',
        'reports.view',
      ],
      system: true,
    },
  });

  const fieldRole = await prisma.role.upsert({
    where: { key: 'terreno' },
    update: {},
    create: {
      key: 'terreno',
      name: 'Técnico / Inspector en Terreno',
      description: 'Toma de datos móviles, ejecución de OT y captura GPS',
      permissions: [
        'activities.read.own',
        'activities.create',
        'activities.write',
      ],
      system: true,
    },
  });

  // 2. Unidades operativas de la CNR
  const unitRiego = await prisma.unit.upsert({
    where: { code: 'OBRAS_RIEGO' },
    update: {},
    create: {
      code: 'OBRAS_RIEGO',
      name: 'División de Obras de Riego (Ley 18.450)',
    },
  });

  const unitTI = await prisma.unit.upsert({
    where: { code: 'UTIC' },
    update: {},
    create: {
      code: 'UTIC',
      name: 'Unidad de Tecnologías de Información (UTIC)',
    },
  });

  // 3. Usuarios de demostración (Admin y Terreno solicitados en la TDR)
  const passwordHash = await hash('Cnr2026!Demo');

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@cnr.gob.cl' },
    update: { passwordHash },
    create: {
      email: 'admin@cnr.gob.cl',
      name: 'Administrador CNR Demo',
      passwordHash,
      roleId: adminRole.id,
      unitId: unitTI.id,
    },
  });

  const fieldUser = await prisma.user.upsert({
    where: { email: 'terreno@cnr.gob.cl' },
    update: { passwordHash },
    create: {
      email: 'terreno@cnr.gob.cl',
      name: 'Juan Inspector (Terreno)',
      passwordHash,
      roleId: fieldRole.id,
      unitId: unitRiego.id,
    },
  });

  // 4. Workflow por defecto
  const defaultWf = await prisma.workflow.upsert({
    where: { id: 'wf-default' },
    update: { definition: DEFAULT_WORKFLOW as any },
    create: {
      id: 'wf-default',
      name: 'Flujo Institucional CNR (Revisión y Cierre)',
      definition: DEFAULT_WORKFLOW as any,
    },
  });

  // 5. Plantilla de Formulario para Inspección de Obras de Riego
  const formTemplate = await prisma.formTemplate.upsert({
    where: { key: 'form_inspeccion_riego' },
    update: {},
    create: {
      key: 'form_inspeccion_riego',
      name: 'Formulario de Inspección de Obras de Riego',
      description: 'Formulario digital con condicionales, fotos con bloqueo de galería y captura de geometrías',
      unitId: unitRiego.id,
      currentVersion: 1,
      draft: {},
      versions: {
        create: {
          version: 1,
          definition: {
            fields: [
              { key: 'sec_gral', type: 'section', label: '1. Datos Generales de la Obra' },
              { key: 'codigo_proyecto', type: 'text', label: 'Código CNR del Proyecto', required: true, prefill: { source: 'activity', path: 'externalRef' } },
              { key: 'estado_obra', type: 'select', label: 'Estado de la Infraestructura', required: true, options: [
                { value: 'conforme', label: 'Conforme a especificaciones' },
                { value: 'observaciones', label: 'Con observaciones técnicas' },
                { value: 'paralizada', label: 'Obra paralizada / Daños graves' },
              ]},
              { key: 'obs_detalle', type: 'textarea', label: 'Detalle de las observaciones técnicas', hidden: true },
              { key: 'foto_evidencia', type: 'photo', label: 'Fotografía obligatoria en terreno', hidden: true, config: { allowGallery: false } },
              { key: 'caudal_medido', type: 'number', label: 'Caudal aforado (Litros / seg)', config: { min: 0, max: 5000 } },
              { key: 'nota_voz', type: 'audio', label: 'Nota de voz en terreno' },
              { key: 'dictado_voz', type: 'speech', label: 'Observaciones por dictado / transcripción de voz' },
              { key: 'firma_inspector', type: 'signature', label: 'Firma de conformidad del inspector', required: true },
            ],
            rules: [
              {
                when: { field: 'estado_obra', op: 'in', value: ['observaciones', 'paralizada'] },
                then: [
                  { action: 'show', target: 'obs_detalle' },
                  { action: 'require', target: 'obs_detalle' },
                  { action: 'show', target: 'foto_evidencia' },
                  { action: 'require', target: 'foto_evidencia' },
                ],
              },
            ],
          },
        },
      },
    },
  });

  // 6. Tipos de actividad institucional (TDR punto 2)
  const tipos = [
    { key: 'inspeccion_obras', name: 'Inspección de Obras de Riego', prefix: 'INS', color: '#0284c7', unitId: unitRiego.id },
    { key: 'orden_trabajo', name: 'Órdenes de Trabajo (OT)', prefix: 'OT', color: '#f59e0b', unitId: unitRiego.id },
    { key: 'visita_tecnica', name: 'Visitas Técnicas', prefix: 'VT', color: '#10b981', unitId: unitRiego.id },
    { key: 'mantencion_oficina', name: 'Mantención de Oficina', prefix: 'MNT', color: '#6366f1', unitId: unitTI.id },
    { key: 'soporte_ti', name: 'Soporte Informático a Usuarios', prefix: 'SOP', color: '#8b5cf6', unitId: unitTI.id },
    { key: 'levantamiento_info', name: 'Levantamiento de Información', prefix: 'LEV', color: '#ec4899', unitId: unitRiego.id },
  ];

  for (const t of tipos) {
    await prisma.activityType.upsert({
      where: { key: t.key },
      update: {},
      create: {
        key: t.key,
        name: t.name,
        prefix: t.prefix,
        color: t.color,
        workflowId: defaultWf.id,
        formTemplateId: formTemplate.id,
        unitId: t.unitId,
      },
    });
  }

  // 7. Datos de demostración precargados (limpia registros E2E si los hay y carga los folios demo)
  await prisma.activity.deleteMany({ where: { title: { contains: '(E2E)' } } });
  const existingDemo = await prisma.activity.findUnique({ where: { folio: 'OT-2026-000001' } });
  if (!existingDemo) {
    await prisma.folioCounter.deleteMany({ where: { prefix: 'INS' } });
    const insType = await prisma.activityType.findUniqueOrThrow({ where: { key: 'inspeccion_obras' } });
    const otType = await prisma.activityType.findUniqueOrThrow({ where: { key: 'orden_trabajo' } });
    const vtType = await prisma.activityType.findUniqueOrThrow({ where: { key: 'visita_tecnica' } });
    const sopType = await prisma.activityType.findUniqueOrThrow({ where: { key: 'soporte_ti' } });
    const fv = await prisma.formVersion.findFirst({ where: { templateId: formTemplate.id }, orderBy: { version: 'desc' } });

    const a1 = await prisma.activity.create({
      data: {
        folio: 'INS-2026-000001',
        typeId: insType.id,
        title: 'Inspección Bocatoma Canal Matriz Maule',
        description: 'Verificación de compuertas, revestimiento y aforo de caudal Ley 18.450.',
        priority: 'ALTA',
        status: 'EN_EJECUCION',
        progress: 45,
        assigneeId: fieldUser.id,
        createdById: adminUser.id,
        unitId: unitRiego.id,
        formVersionId: fv?.id ?? null,
        externalRef: 'CNR-18450-9921',
        address: 'Sector Colbún, Región del Maule',
        lat: -35.695,
        lng: -71.405,
        data: { codigo_proyecto: 'CNR-18450-9921', estado_obra: 'conforme', caudal_medido: 850 },
      },
    });

    await prisma.geoFeature.createMany({
      data: [
        {
          id: 'geo-demo-pt-1',
          code: 'PT-2026-000001',
          activityId: a1.id,
          kind: 'POINT',
          geometry: { type: 'Point', coordinates: [-71.405, -35.695] },
          label: 'Compuerta Captación N°1',
          status: 'Conforme',
          observations: 'Estructura operativa sin filtraciones',
          accuracy: 3.2,
          capturedAt: new Date(),
          capturedById: fieldUser.id,
        },
        {
          id: 'geo-demo-ln-1',
          code: 'LN-2026-000001',
          activityId: a1.id,
          kind: 'LINE',
          geometry: {
            type: 'LineString',
            coordinates: [[-71.405, -35.695], [-71.408, -35.698], [-71.412, -35.701]],
          },
          label: 'Tramo Revestido 450m',
          status: 'Conforme',
          accuracy: 4.5,
          capturedAt: new Date(),
          capturedById: fieldUser.id,
        },
      ],
    });

    const a2 = await prisma.activity.create({
      data: {
        folio: 'OT-2026-000001',
        typeId: otType.id,
        title: 'Reparación Telemetría Estación Limarí',
        description: 'Reemplazo de sensor ultrasónico de nivel y calibración en terreno.',
        priority: 'CRITICA',
        status: 'EN_REVISION',
        progress: 80,
        assigneeId: fieldUser.id,
        createdById: adminUser.id,
        unitId: unitRiego.id,
        formVersionId: fv?.id ?? null,
        address: 'Embalse La Paloma, Ovalle, Coquimbo',
        lat: -30.688,
        lng: -71.036,
        data: {
          codigo_proyecto: 'OT-LIM-04',
          estado_obra: 'observaciones',
          obs_detalle: 'Sensor reemplazado; se observa oxidación leve en gabinete.',
          caudal_medido: 310,
        },
      },
    });

    await prisma.geoFeature.create({
      data: {
        id: 'geo-demo-pg-1',
        code: 'PG-2026-000001',
        activityId: a2.id,
        kind: 'POLYGON',
        geometry: {
          type: 'Polygon',
          coordinates: [[[-71.038, -30.686], [-71.034, -30.686], [-71.034, -30.69], [-71.038, -30.69], [-71.038, -30.686]]],
        },
        label: 'Área Estación Limarí',
        status: 'En Revisión',
        accuracy: 4.0,
        capturedAt: new Date(),
        capturedById: fieldUser.id,
      },
    });

    await prisma.activityTransition.create({
      data: {
        activityId: a2.id,
        transitionKey: 'enviar_revision',
        label: 'Enviar a revisión',
        fromStatus: 'EN_EJECUCION',
        toStatus: 'EN_REVISION',
        userId: fieldUser.id,
        comment: 'Trabajo completado, adjunto observaciones del gabinete.',
      },
    });

    await prisma.activity.createMany({
      data: [
        {
          folio: 'VT-2026-000001',
          typeId: vtType.id,
          title: 'Visita Técnica Canal Laja Sur',
          description: 'Levantamiento inicial de beneficiarios y trazado.',
          priority: 'MEDIA',
          status: 'ASIGNADA',
          progress: 10,
          assigneeId: fieldUser.id,
          createdById: adminUser.id,
          unitId: unitRiego.id,
          address: 'Los Ángeles, Biobío',
          lat: -37.468,
          lng: -72.353,
        },
        {
          folio: 'SOP-2026-000001',
          typeId: sopType.id,
          title: 'Soporte TI Puesto de Trabajo Piso 4',
          description: 'Configuración de VPN institucional y certificado digital.',
          priority: 'BAJA',
          status: 'CERRADA',
          progress: 100,
          assigneeId: adminUser.id,
          createdById: adminUser.id,
          unitId: unitTI.id,
          address: "Libertador Bernardo O'Higgins 1449, Torre 1, Piso 4",
          lat: -33.446,
          lng: -70.658,
          closedAt: new Date(),
        },
      ],
    });

    await prisma.notification.create({
      data: {
        userId: adminUser.id,
        title: 'OT-2026-000001 requiere revisión',
        body: 'Juan Inspector envió a revisión la reparación de telemetría en Limarí.',
        link: `/actividades/${a2.id}`,
      },
    });
  }

  console.log('Seed completado exitosamente.');
  console.log('Credenciales de demostración creadas:');
  console.log('• Administrador: admin@cnr.gob.cl / Cnr2026!Demo');
  console.log('• Usuario Terreno: terreno@cnr.gob.cl / Cnr2026!Demo');
}

main().catch(console.error).finally(() => prisma.$disconnect());
