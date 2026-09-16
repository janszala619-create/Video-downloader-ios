require 'xcodeproj'

project_path = File.expand_path('../ios/App/App.xcodeproj', __dir__)
project = Xcodeproj::Project.open(project_path)
app = project.targets.find { |target| target.name == 'App' }
tests = project.new_target(:unit_test_bundle, 'AppTests', :ios, '13.0')
tests.add_dependency(app)
group = project.main_group.new_group('AppTests', 'AppTests')
tests.source_build_phase.add_file_reference(group.new_file('NativeMediaTests.swift'))
tests.resources_build_phase.add_file_reference(group.new_file('Fixtures/sample.mp4'))
tests.build_configurations.each do |config|
  config.build_settings['SWIFT_VERSION'] = '5.0'
  config.build_settings['PRODUCT_NAME'] = '$(TARGET_NAME)'
  config.build_settings['GENERATE_INFOPLIST_FILE'] = 'YES'
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'de.vidsave.app.tests'
  config.build_settings['TEST_HOST'] = '$(BUILT_PRODUCTS_DIR)/App.app/App'
  config.build_settings['BUNDLE_LOADER'] = '$(TEST_HOST)'
end
project.save
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(app)
scheme.add_test_target(tests)
scheme.set_launch_target(app)
scheme.save_as(project_path, 'AppMediaTests', true)
