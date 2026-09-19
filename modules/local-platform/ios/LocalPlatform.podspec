Pod::Spec.new do |s|
  s.name = 'LocalPlatform'
  s.version = '0.1.0'
  s.summary = 'Local-only fixture and share bridge for SNS Gateway'
  s.description = 'SG-01 fixture-only shared-sheet integration, no publishing API.'
  s.author = 'AofSpds'
  s.homepage = 'https://github.com/AofSpds/sns-gateway'
  s.license = { :type => 'UNLICENSED' }
  s.platforms = { :ios => '16.4' }
  s.source = { :git => 'https://github.com/AofSpds/sns-gateway.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.swift_version = '5.9'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
